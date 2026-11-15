"use client";

/**
 * Achat / vente d'un token déjà coté sur Arc (hors lancements OM) avec le routeur Uniswap V4 d'OM.
 * USDC est la monnaie native d'Arc (18 décimales côté wallet). Signé dans un wallet EVM (MetaMask, Rabby…),
 * même quand on est connecté à OM avec un wallet Solana.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { createPublicClient, encodeFunctionData, http, parseAbi } from "viem";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { arc } from "@/lib/arc-chain";
import { ARC_DIRECT_ROUTER_ABI, ARC_DIRECT_ROUTER_ADDRESS } from "@/lib/arc-launchpad";
import { getProviderByType } from "@/lib/wallet/adapters";
import { prepareEvmWallet, connectEvmTrader, disconnectEvmTrader, restoreEvmTrader, type TradingAccount } from "@/lib/wallet/evm-trading";

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
]);
/** Frais de pool V4 sans hook que le routeur sait viser ; on garde celui qui donne le meilleur prix. */
const FEES = [100, 500, 2500, 3000, 5000, 10000, 15000, 20000, 30000];
const GAS_RESERVE = 20_000_000_000_000_000n; // 0,02 USDC gardés pour le gaz

const client = () => createPublicClient({ chain: arc, transport: http("/api/arc-rpc") });
const toRaw = (v: string, d: number) => { const [i, f = ""] = v.split("."); if (!/^\d*$/.test(i) || !/^\d*$/.test(f)) return 0n; return BigInt(i || "0") * 10n ** BigInt(d) + BigInt(f.padEnd(d, "0").slice(0, d) || "0"); };
const fromRaw = (r: bigint, d: number) => Number(r) / 10 ** d;
const fmt = (n: number) => !Number.isFinite(n) ? "0" : n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) : n.toPrecision(3);

async function ensureArc(eth: Eth) {
  const id = (await eth.request({ method: "eth_chainId" })) as string;
  if (parseInt(id, 16) === 5042) return;
  try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13B2" }] }); }
  catch (e) {
    const code = (e as { code?: number })?.code;
    if (code !== 4902 && code !== -32603) throw e;
    await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x13B2", chainName: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: ["https://rpc.mainnet.arc.io"], blockExplorerUrls: ["https://explorer.arc.io"] }] });
  }
}
async function waitReceipt(hash: string) {
  const c = client();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const r = await c.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
    if (r) { if (r.status === "reverted") throw new Error("Transaction failed"); return; }
  }
}

export function ArcTradeBox({ token, symbol }: { token: string; symbol: string }) {
  const { tr } = useT();
  const { walletAddress, isAuthenticated } = useAuth();
  const evm = isAuthenticated && !!walletAddress && walletAddress.startsWith("0x");
  const [trader, setTrader] = useState<TradingAccount | null>(null);
  useEffect(() => { if (!evm) void restoreEvmTrader().then(setTrader); }, [evm]);
  useEffect(() => { prepareEvmWallet(); }, []);
  const addr = (evm ? walletAddress : trader?.address ?? null) as `0x${string}` | null;
  const router = ARC_DIRECT_ROUTER_ADDRESS;
  const tok = token as `0x${string}`;

  const [dec, setDec] = useState<number | null>(null);
  const [fee, setFee] = useState<number | null | undefined>(undefined); // undefined : recherche ; null : aucun pool compatible
  const [bal, setBal] = useState<{ usdc: bigint; tok: bigint } | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(100);
  const [showSlip, setShowSlip] = useState(false);
  const [out, setOut] = useState<bigint | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  // Décimales du token et pool compatible (meilleur prix pour 1 USDC parmi les frais connus)
  useEffect(() => {
    let off = false;
    (async () => {
      const c = client();
      try { const d = await c.readContract({ address: tok, abi: ERC20, functionName: "decimals" }); if (!off) setDec(Number(d)); } catch { if (!off) setDec(18); }
      if (!router) { if (!off) setFee(null); return; }
      const res = await Promise.all(FEES.map(async (f) => {
        try { const { result } = await c.simulateContract({ address: router, abi: ARC_DIRECT_ROUTER_ABI, functionName: "quoteBuy", args: [tok, f, 10n ** 18n] }); return { f, o: result as bigint }; }
        catch { return { f, o: 0n }; }
      }));
      const best = res.filter((x) => x.o > 0n).sort((a, b) => (b.o > a.o ? 1 : -1))[0];
      if (!off) setFee(best ? best.f : null);
    })();
    return () => { off = true; };
  }, [tok, router]);

  const loadBal = useCallback(async () => {
    if (!addr) { setBal(null); return; }
    try {
      const c = client();
      const [usdc, t] = await Promise.all([c.getBalance({ address: addr }), c.readContract({ address: tok, abi: ERC20, functionName: "balanceOf", args: [addr] }) as Promise<bigint>]);
      setBal({ usdc, tok: t });
    } catch { /* solde indisponible */ }
  }, [addr, tok]);
  useEffect(() => { void loadBal(); }, [loadBal]);

  const inDec = side === "buy" ? 18 : dec ?? 18;
  const outDec = side === "buy" ? dec ?? 18 : 18;
  const raw = amount && dec != null ? toRaw(amount, inDec) : 0n;
  const spendable = bal == null ? null : side === "buy" ? (bal.usdc > GAS_RESERVE ? bal.usdc - GAS_RESERVE : 0n) : bal.tok;
  const tooMuch = raw > 0n && spendable != null && raw > spendable;

  useEffect(() => {
    setOut(null);
    if (raw <= 0n || !fee || !router) return;
    const id = ++seq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const { result } = await client().simulateContract({ address: router, abi: ARC_DIRECT_ROUTER_ABI, functionName: side === "buy" ? "quoteBuy" : "quoteSell", args: [tok, fee, raw] });
        if (id === seq.current) setOut((result as bigint) > 0n ? (result as bigint) : null);
      } catch { if (id === seq.current) setOut(null); }
      if (id === seq.current) setQuoting(false);
    }, 350);
    return () => clearTimeout(t);
  }, [raw, fee, side, tok, router]);

  async function connect() {
    setBusy(tr("Connecting…"));
    try { setTrader(await connectEvmTrader()); }
    catch (e) {
      const m = (e as { message?: string; code?: number })?.message ?? "";
      if ((e as { code?: number })?.code !== 4001 && !/reject|cancel|denied|declined|closed/i.test(m)) toast.error(tr(m) || tr("Could not connect"));
    }
    setBusy(null);
  }

  async function swap() {
    if (!addr || !router || !fee || !out || raw <= 0n) return;
    const eth = (evm ? getProviderByType("metamask") : trader?.provider ?? null) as unknown as Eth | null;
    if (!eth?.request) { toast.error(tr("No EVM wallet detected")); return; }
    try {
      setBusy(tr("Switching network"));
      await ensureArc(eth);
      const minOut = (out * BigInt(10_000 - slip)) / 10_000n;
      let hash: string;
      if (side === "buy") {
        setBusy(tr("Confirm in your wallet"));
        const data = encodeFunctionData({ abi: ARC_DIRECT_ROUTER_ABI, functionName: "buy", args: [tok, fee, minOut, addr] });
        hash = (await eth.request({ method: "eth_sendTransaction", params: [{ from: addr, to: router, data, value: `0x${raw.toString(16)}` }] })) as string;
      } else {
        const allowance = (await client().readContract({ address: tok, abi: ERC20, functionName: "allowance", args: [addr, router] })) as bigint;
        if (allowance < raw) {
          setBusy(tr("Approve in your wallet"));
          const h = (await eth.request({ method: "eth_sendTransaction", params: [{ from: addr, to: tok, data: encodeFunctionData({ abi: ERC20, functionName: "approve", args: [router, raw] }) }] })) as string;
          await waitReceipt(h);
        }
        setBusy(tr("Confirm in your wallet"));
        const data = encodeFunctionData({ abi: ARC_DIRECT_ROUTER_ABI, functionName: "sell", args: [tok, fee, raw, minOut, addr] });
        hash = (await eth.request({ method: "eth_sendTransaction", params: [{ from: addr, to: router, data }] })) as string;
      }
      setBusy(tr("Waiting for confirmation"));
      await waitReceipt(hash);
      toast.success(side === "buy" ? tr("Bought {symbol}", { symbol }) : tr("Sold {symbol}", { symbol }), { action: { label: tr("Explorer"), onClick: () => window.open(`https://explorer.arc.io/tx/${hash}`, "_blank", "noopener") } });
      setAmount("");
      setTimeout(() => void loadBal(), 3000);
    } catch (e) {
      const m = (e as { message?: string; code?: number })?.message ?? "";
      if ((e as { code?: number })?.code !== 4001 && !/reject|cancel|denied|declined/i.test(m)) toast.error(tr(m) || tr("Swap failed"));
    }
    setBusy(null);
  }

  if (fee === undefined || dec == null) return <div className="h-[380px] animate-pulse rounded-3xl bg-card ring-1 ring-border" />;
  if (!fee) return <div className="rounded-3xl bg-card p-5 text-sm text-muted-foreground ring-1 ring-border">{tr("This token has no pool OM can trade yet. You can still trade it on Uniswap.")}</div>;

  const inSym = side === "buy" ? "USDC" : symbol;
  const outSym = side === "buy" ? symbol : "USDC";
  let label = side === "buy" ? tr("Buy {symbol}", { symbol }) : tr("Sell {symbol}", { symbol });
  let disabled = !!busy || quoting || !out;
  if (!addr) { label = isAuthenticated ? tr("Connect an EVM wallet to trade on {chain}", { chain: "Arc" }) : tr("Connect wallet"); disabled = !!busy; }
  else if (raw <= 0n) { label = tr("Enter an amount"); disabled = true; }
  else if (tooMuch) { label = tr("Insufficient {symbol} balance", { symbol: inSym }); disabled = true; }
  if (busy) label = busy;

  return (
    <div className="rounded-3xl bg-card p-4 ring-1 ring-border">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-2xl bg-muted p-1">
          {(["buy", "sell"] as const).map((s) => (
            <button key={s} onClick={() => { setSide(s); setAmount(""); }} className={`flex-1 rounded-xl py-2 text-[15px] font-bold ${side === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{s === "buy" ? tr("Buy") : tr("Sell")}</button>
          ))}
        </div>
        <button onClick={() => setShowSlip((v) => !v)} aria-label={tr("Slippage")} className={`flex h-10 items-center gap-1 rounded-xl px-2.5 text-xs font-bold ${showSlip ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}><Settings2 className="size-4" />{slip / 100}%</button>
      </div>
      {showSlip && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-muted/50 p-2">
          <span className="px-1 text-xs font-semibold text-muted-foreground">{tr("Slippage")}</span>
          {[50, 100, 300].map((x) => <button key={x} onClick={() => setSlip(x)} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${slip === x ? "bg-foreground text-background" : "text-foreground hover:bg-muted"}`}>{x / 100}%</button>)}
        </div>
      )}
      <div className="mt-3 rounded-2xl bg-muted/50 p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{tr("You pay")}</span>
          {spendable != null && (
            <span className="flex items-center gap-1.5"><span className="num">{fmt(fromRaw(side === "buy" ? bal!.usdc : bal!.tok, inDec))} {inSym}</span>
              <button onClick={() => setAmount(spendable > 0n ? String(fromRaw(spendable, inDec)) : "")} className="rounded-md bg-background px-1.5 py-0.5 font-bold text-foreground">MAX</button></span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0" className="num min-w-0 flex-1 bg-transparent text-[28px] font-bold outline-none placeholder:text-muted-foreground/40" />
          <span className="rounded-xl bg-background px-2.5 py-1.5 text-sm font-bold">{inSym}</span>
        </div>
      </div>
      <div className="mt-2 rounded-2xl bg-muted/50 p-3">
        <div className="text-xs text-muted-foreground">{tr("You receive")}</div>
        <div className="mt-2 flex items-center gap-2">
          <span className={`num min-w-0 flex-1 truncate text-[28px] font-bold ${out ? "text-foreground" : "text-muted-foreground/50"}`}>{quoting ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : out ? fmt(fromRaw(out, outDec)) : "0"}</span>
          <span className="rounded-xl bg-background px-2.5 py-1.5 text-sm font-bold">{outSym}</span>
        </div>
      </div>
      {out && (
        <div className="mt-3 space-y-1.5 px-1 text-[13px]">
          <div className="flex justify-between"><span className="text-muted-foreground">{tr("Minimum received")}</span><span className="num font-semibold">{fmt(fromRaw((out * BigInt(10_000 - slip)) / 10_000n, outDec))} {outSym}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{tr("Route")}</span><span className="font-semibold">Uniswap V4 · {fee / 10_000}%</span></div>
        </div>
      )}
      <button onClick={addr ? swap : isAuthenticated ? connect : () => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} disabled={disabled}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[15px] font-bold text-background disabled:opacity-40">
        {busy && <Loader2 className="size-4 animate-spin" />}{label}
      </button>
      {!evm && trader && (
        <p className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="num">{trader.address.slice(0, 6)}...{trader.address.slice(-4)}</span>
          <button onClick={() => { void disconnectEvmTrader(); setTrader(null); setBal(null); }} className="font-semibold underline">{tr("Disconnect")}</button>
        </p>
      )}
    </div>
  );
}
