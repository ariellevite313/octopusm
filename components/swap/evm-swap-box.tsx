"use client";

/** Achat / vente d'un token sur Base, BNB Chain ou HyperEVM (0x, frais OM 0,3 %), signé dans le portefeuille EVM. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { encodeFunctionData, erc20Abi, toHex } from "viem";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { getProviderByType } from "@/lib/wallet/adapters";
import { toRaw, fromRaw } from "@/lib/swap/client";
import { EVM_CHAINS, type EvmChain } from "@/lib/swap/evm";
import { prefetchWalletConnect } from "@/lib/wallet/walletconnect";
import { prepareEvmWallet, connectEvmTrader, disconnectEvmTrader, restoreEvmTrader, type TradingAccount } from "@/lib/wallet/evm-trading";

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
type Info = { token: { address: string; decimals: number; symbol: string }; balances: { native: string; token: string } | null };
type Quote = { buyAmount: string; minBuyAmount: string; feeBps: number; feeNative: string | null; route: string[]; allowanceSpender: string | null; balanceShort: boolean; tx: { to: string; data: string; value: string; gas: string | null } | null };

const GAS_RESERVE: Record<EvmChain, bigint> = { base: 300_000_000_000_000n, bnb: 2_000_000_000_000_000n, hyperliquid: 20_000_000_000_000_000n, ethereum: 3_000_000_000_000_000n, arbitrum: 300_000_000_000_000n, polygon: 50_000_000_000_000_000n, avalanche: 20_000_000_000_000_000n };
const fmt = (n: number) => !Number.isFinite(n) ? "0" : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) : n.toPrecision(4).replace(/\.?0+$/, "");

async function ensureChain(eth: Eth, chain: EvmChain) {
  const c = EVM_CHAINS[chain];
  const hex = toHex(c.id);
  try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
  catch (e) {
    const code = (e as { code?: number })?.code;
    if (code !== 4902 && code !== -32603) throw e;
    await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: c.name, nativeCurrency: { name: c.native, symbol: c.native, decimals: 18 }, rpcUrls: [c.rpc], blockExplorerUrls: [c.explorer] }] });
  }
}
async function waitReceipt(eth: Eth, hash: string) {
  for (let i = 0; i < 60; i++) {
    const r = (await eth.request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null)) as { status?: string } | null;
    if (r) { if (r.status === "0x0") throw new Error("Transaction failed"); return; }
    await new Promise((res) => setTimeout(res, 2000));
  }
}

export function EvmSwapBox({ chain, token, refPost }: { chain: EvmChain; token: string; refPost?: string }) {
  const { tr } = useT();
  const { walletAddress, isAuthenticated } = useAuth();
  const evm = isAuthenticated && !!walletAddress && walletAddress.startsWith("0x");
  // Connecté avec un wallet Solana : on signe avec un wallet EVM relié ici (extension ou WalletConnect)
  const [trader, setTrader] = useState<TradingAccount | null>(null);
  useEffect(() => { if (!evm) void restoreEvmTrader().then(setTrader); }, [evm]);
  useEffect(() => { prefetchWalletConnect(); prepareEvmWallet(); }, []);
  const addr = evm ? walletAddress! : trader?.address ?? null;
  const c = EVM_CHAINS[chain];
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(100);
  const [showSlip, setShowSlip] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [qErr, setQErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(() => {
    fetch(`/api/swap/evm/token?chain=${chain}&token=${token}${!evm && addr ? `&address=${addr}` : ""}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setInfo(j); setErr(null); }).catch((e) => setErr((e as Error).message || "Token not found"));
  }, [chain, token, evm, addr]);
  useEffect(() => { load(); }, [load, walletAddress]);

  const inDec = side === "buy" ? 18 : info?.token.decimals ?? 18;
  const outDec = side === "buy" ? info?.token.decimals ?? 18 : 18;
  const raw = info ? toRaw(amount, inDec) : null;
  const bal = info?.balances ? BigInt(side === "buy" ? info.balances.native : info.balances.token) : null;
  const spendable = bal == null ? null : side === "buy" ? (bal > GAS_RESERVE[chain] ? bal - GAS_RESERVE[chain] : 0n) : bal;
  const tooMuch = raw != null && spendable != null && BigInt(raw) > spendable;
  const inSym = side === "buy" ? c.native : info?.token.symbol ?? "";
  const outSym = side === "buy" ? info?.token.symbol ?? "" : c.native;

  const body = useCallback((mode: "price" | "quote") => JSON.stringify({ chain, side, token, amount: raw, slippageBps: slip, mode, ...(!evm && addr ? { taker: addr } : {}), ...(mode === "quote" && refPost ? { refPost } : {}) }), [chain, side, token, raw, slip, evm, addr, refPost]);

  useEffect(() => {
    setQuote(null); setQErr(null);
    if (!raw) return;
    const id = ++seq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/swap/evm", { method: "POST", headers: { "Content-Type": "application/json" }, body: body("price") });
        const j = await r.json();
        if (id !== seq.current) return;
        if (!r.ok) setQErr(j.error ?? "No price"); else setQuote(j);
      } catch { if (id === seq.current) setQErr(tr("Could not get a price for this swap")); }
      if (id === seq.current) setQuoting(false);
    }, 450);
    return () => clearTimeout(t);
  }, [raw, body, tr]);

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
    if (!raw || !addr || !info) return;
    const eth = (evm ? getProviderByType("metamask") : trader?.provider ?? null) as unknown as Eth | null;
    if (!eth?.request) { toast.error(tr("No EVM wallet detected")); return; }
    try {
      setBusy(tr("Switching network"));
      await ensureChain(eth, chain);
      // Vente : autoriser le contrat 0x à dépenser le token (une fois)
      if (side === "sell" && quote?.allowanceSpender) {
        setBusy(tr("Approve in your wallet"));
        const hash = (await eth.request({ method: "eth_sendTransaction", params: [{ from: addr, to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [quote.allowanceSpender as `0x${string}`, BigInt(raw)] }) }] })) as string;
        await waitReceipt(eth, hash);
      }
      setBusy(tr("Confirm in your wallet"));
      const r = await fetch("/api/swap/evm", { method: "POST", headers: { "Content-Type": "application/json" }, body: body("quote") });
      const q = (await r.json()) as Quote & { error?: string; ref?: { postId: string; holder: string; feeNative: string; taker: string; token: string } };
      if (!r.ok || !q.tx) throw new Error(q.error ?? "Swap failed");
      const hash = (await eth.request({ method: "eth_sendTransaction", params: [{ from: addr, to: q.tx.to, data: q.tx.data, value: toHex(BigInt(q.tx.value || "0")), ...(q.tx.gas ? { gas: toHex(BigInt(q.tx.gas)) } : {}) }] })) as string;
      setBusy(tr("Waiting for confirmation"));
      await waitReceipt(eth, hash);
      // Swap lancé depuis un post « sac » : on enregistre la part du détenteur (jamais bloquant)
      if (q.ref) void fetch("/api/chill/evm-record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chain, hash, postId: q.ref.postId, holder: q.ref.holder, feeNative: q.ref.feeNative, taker: q.ref.taker, token, to: q.tx.to, data: q.tx.data, refToken: q.ref.token }) }).catch(() => {});
      toast.success(side === "buy" ? tr("Bought {symbol}", { symbol: info.token.symbol }) : tr("Sold {symbol}", { symbol: info.token.symbol }), {
        action: { label: tr("Explorer"), onClick: () => window.open(`${c.explorer}/tx/${hash}`, "_blank", "noopener") },
      });
      setAmount("");
      setTimeout(load, 3000);
    } catch (e) {
      const m = (e as { message?: string; code?: number })?.message ?? "";
      if ((e as { code?: number })?.code !== 4001 && !/reject|cancel|denied|declined/i.test(m)) toast.error(tr(m) || tr("Swap failed"));
    }
    setBusy(null);
  }

  if (err) return <div className="rounded-3xl bg-card p-5 text-sm text-muted-foreground ring-1 ring-border">{tr(err)}</div>;
  if (!info) return <div className="h-[380px] animate-pulse rounded-3xl bg-card ring-1 ring-border" />;

  const feeUi = quote?.feeNative ? fromRaw(quote.feeNative, 18) : null;
  let label = side === "buy" ? tr("Buy {symbol}", { symbol: info.token.symbol }) : tr("Sell {symbol}", { symbol: info.token.symbol });
  let disabled = !!busy || quoting || !quote;
  if (!addr) { label = isAuthenticated ? tr("Connect an EVM wallet to trade on {chain}", { chain: c.name }) : tr("Connect wallet"); disabled = !!busy; }
  else if (!raw) { label = tr("Enter an amount"); disabled = true; }
  else if (tooMuch || quote?.balanceShort) { label = tr("Insufficient {symbol} balance", { symbol: inSym }); disabled = true; }
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
            <span className="flex items-center gap-1.5"><span className="num">{fmt(fromRaw(bal ?? 0n, inDec))} {inSym}</span>
              <button onClick={() => setAmount(spendable > 0n ? String(fromRaw(spendable, inDec)) : "")} className="rounded-md bg-background px-1.5 py-0.5 font-bold text-foreground">MAX</button></span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0" className="num min-w-0 flex-1 bg-transparent text-[28px] font-bold outline-none placeholder:text-muted-foreground/50" />
          <span className="rounded-xl bg-background px-2.5 py-1.5 text-sm font-bold">{inSym}</span>
        </div>
      </div>
      <div className="mt-2 rounded-2xl bg-muted/50 p-3">
        <div className="text-xs text-muted-foreground">{tr("You receive")}</div>
        <div className="mt-2 flex items-center gap-2">
          <span className={`num min-w-0 flex-1 truncate text-[28px] font-bold ${quote ? "text-foreground" : "text-muted-foreground/50"}`}>{quoting ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : quote ? fmt(fromRaw(quote.buyAmount, outDec)) : "0"}</span>
          <span className="rounded-xl bg-background px-2.5 py-1.5 text-sm font-bold">{outSym}</span>
        </div>
      </div>
      {qErr && <p className="mt-2 px-1 text-xs font-semibold text-down">{tr(qErr)}</p>}
      {quote && (
        <div className="mt-3 space-y-1.5 px-1 text-[13px]">
          <div className="flex justify-between"><span className="text-muted-foreground">{tr("Minimum received")}</span><span className="num font-semibold">{fmt(fromRaw(quote.minBuyAmount, outDec))} {outSym}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{tr("OM fee")}</span><span className="num font-semibold">{quote.feeBps / 100}%{feeUi != null ? ` · ${fmt(feeUi)} ${c.native}` : ""}</span></div>
          {quote.route.length > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{tr("Route")}</span><span className="truncate font-semibold">{quote.route.join(" › ")}</span></div>}
        </div>
      )}
      <button onClick={addr ? swap : isAuthenticated ? connect : () => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} disabled={disabled}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[15px] font-bold text-background disabled:opacity-40">
        {busy && <Loader2 className="size-4 animate-spin" />}{label}
      </button>
      {!evm && trader && (
        <p className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="num">{trader.address.slice(0, 6)}...{trader.address.slice(-4)}</span>
          <button onClick={() => { void disconnectEvmTrader(); setTrader(null); setInfo(null); load(); }} className="font-semibold underline">{tr("Disconnect")}</button>
        </p>
      )}
    </div>
  );
}
