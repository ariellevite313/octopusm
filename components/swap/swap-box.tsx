"use client";

/**
 * Boîte d'achat / vente OM (Solana) pour n'importe quel token : itinéraire Jupiter, frais OM affichés avant de signer,
 * minimum reçu garanti par le slippage. Le portefeuille de l'utilisateur est le seul à signer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { SOL_MINT, USDC_MINT } from "@/lib/swap/core";
import { executeSwap, fromRaw, toRaw } from "@/lib/swap/client";

type Token = { mint: string; decimals: number; symbol: string; name: string; logo: string | null; price: number | null; om_id: string | null; fee_bps: number };
type Balances = { token: string; sol: string; usdc: string } | null;
type Quote = { inAmount: string; outAmount: string; minOut: string; feeBps: number; feeMint: string | null; priceImpactPct: number | null; route: string[] };

const BASES = { SOL: { mint: SOL_MINT, decimals: 9, logo: "/solana.png" }, USDC: { mint: USDC_MINT, decimals: 6, logo: "/usdc-coin.png" } } as const;
type Base = keyof typeof BASES;
const SLIPS = [50, 100, 300];
const SOL_RESERVE = 10_000_000n; // 0,01 SOL gardé pour les frais réseau

function fmt(n: number, max = 6): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toPrecision(Math.min(max, 4)).replace(/\.?0+$/, "");
}

export function SwapBox({ mint, onSwapped }: { mint: string; onSwapped?: (sig: string) => void }) {
  const { tr } = useT();
  const { walletAddress, walletType, isAuthenticated } = useAuth();
  const solWallet = isAuthenticated && !!walletAddress && !walletAddress.startsWith("0x");

  const [token, setToken] = useState<Token | null>(null);
  const [bal, setBal] = useState<Balances>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [base, setBase] = useState<Base>("SOL");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(100);
  const [showSlip, setShowSlip] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [qErr, setQErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const loadToken = useCallback(async () => {
    try {
      const r = await fetch(`/api/swap/token?mint=${mint}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Token not found");
      setToken(j.token); setBal(j.balances); setLoadErr(null);
    } catch (e) { setLoadErr((e as Error).message); }
  }, [mint]);
  useEffect(() => { void loadToken(); }, [loadToken, walletAddress]);

  const b = BASES[base];
  const inMint = side === "buy" ? b.mint : mint;
  const outMint = side === "buy" ? mint : b.mint;
  const inDec = side === "buy" ? b.decimals : token?.decimals ?? 6;
  const outDec = side === "buy" ? token?.decimals ?? 6 : b.decimals;
  const raw = token ? toRaw(amount, inDec) : null;
  const inBal: bigint | null = !bal ? null : side === "sell" ? BigInt(bal.token) : base === "SOL" ? BigInt(bal.sol) : BigInt(bal.usdc);
  const spendable = inBal == null ? null : side === "buy" && base === "SOL" ? (inBal > SOL_RESERVE ? inBal - SOL_RESERVE : 0n) : inBal;
  const tooMuch = raw != null && spendable != null && BigInt(raw) > spendable;

  // Prix, 450 ms après la dernière frappe
  useEffect(() => {
    setQuote(null); setQErr(null);
    if (!raw || !token) return;
    const id = ++seq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/swap/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputMint: inMint, outputMint: outMint, amount: raw, slippageBps: slip }) });
        const j = await r.json();
        if (id !== seq.current) return;
        if (!r.ok) setQErr(j.error ?? "No price"); else setQuote(j);
      } catch { if (id === seq.current) setQErr(tr("Could not get a price for this swap")); }
      if (id === seq.current) setQuoting(false);
    }, 450);
    return () => clearTimeout(t);
  }, [raw, inMint, outMint, slip, token, tr]);

  const setPct = (p: number) => {
    if (spendable == null) return;
    const v = (spendable * BigInt(p)) / 100n;
    setAmount(v > 0n ? String(fromRaw(v, inDec)) : "");
  };

  async function swap() {
    if (!raw || !walletType || !token) return;
    setBusy(true);
    try {
      const sig = await executeSwap({ inputMint: inMint, outputMint: outMint, amount: raw, slippageBps: slip }, walletType);
      toast.success(side === "buy" ? tr("Bought {symbol}", { symbol: token.symbol }) : tr("Sold {symbol}", { symbol: token.symbol }), {
        action: { label: "Solscan", onClick: () => window.open(`https://solscan.io/tx/${sig}`, "_blank", "noopener") },
      });
      if (token.om_id) {
        void fetch("/api/hackathon/record-trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txSignature: sig, mint }) }).catch(() => {});
      }
      setAmount("");
      onSwapped?.(sig);
      setTimeout(() => void loadToken(), 4000);
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (!/reject|cancel|denied|declined/i.test(m)) toast.error(tr(m) || tr("Swap failed"));
    }
    setBusy(false);
  }

  if (loadErr) return <div className="rounded-3xl bg-card p-5 text-sm text-muted-foreground ring-1 ring-border">{tr(loadErr)}</div>;
  if (!token) return <div className="h-[420px] animate-pulse rounded-3xl bg-card ring-1 ring-border" />;

  const outUi = quote ? fromRaw(quote.outAmount, outDec) : 0;
  const minUi = quote ? fromRaw(quote.minOut, outDec) : 0;
  const feeUi = quote && quote.feeBps > 0 ? fromRaw(quote.feeMint === inMint ? quote.inAmount : quote.outAmount, quote.feeMint === inMint ? inDec : outDec) * (quote.feeBps / 10_000) : 0;
  const feeSym = quote?.feeMint === SOL_MINT ? "SOL" : quote?.feeMint === USDC_MINT ? "USDC" : "";
  const inSym = side === "buy" ? base : token.symbol;
  const outSym = side === "buy" ? token.symbol : base;
  const impactHigh = (quote?.priceImpactPct ?? 0) > 5;

  let label = side === "buy" ? tr("Buy {symbol}", { symbol: token.symbol }) : tr("Sell {symbol}", { symbol: token.symbol });
  let disabled = busy || quoting || !quote;
  if (!solWallet) { label = isAuthenticated ? tr("Connect a Solana wallet to swap") : tr("Connect wallet"); disabled = isAuthenticated; }
  else if (!raw) { label = tr("Enter an amount"); disabled = true; }
  else if (tooMuch) { label = tr("Insufficient {symbol} balance", { symbol: inSym }); disabled = true; }

  const Logo = ({ src, sym }: { src: string | null; sym: string }) => src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" className="size-6 rounded-full bg-muted object-cover" />
    : <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[11px] font-bold">{sym[0]}</span>;

  return (
    <div className="rounded-3xl bg-card p-4 ring-1 ring-border">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-2xl bg-muted p-1">
          {(["buy", "sell"] as const).map((s) => (
            <button key={s} onClick={() => { setSide(s); setAmount(""); }}
              className={`flex-1 rounded-xl py-2 text-[15px] font-bold transition-colors ${side === s ? (s === "buy" ? "bg-up text-background" : "bg-down text-background") : "text-muted-foreground hover:text-foreground"}`}>
              {s === "buy" ? tr("Buy") : tr("Sell")}
            </button>
          ))}
        </div>
        <button onClick={() => setShowSlip((v) => !v)} aria-label={tr("Slippage")}
          className={`flex h-10 items-center gap-1 rounded-xl px-2.5 text-xs font-bold transition-colors ${showSlip ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
          <Settings2 className="size-4" />{slip / 100}%
        </button>
      </div>

      {showSlip && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-muted/50 p-2">
          <span className="px-1 text-xs font-semibold text-muted-foreground">{tr("Slippage")}</span>
          {SLIPS.map((s) => (
            <button key={s} onClick={() => setSlip(s)} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${slip === s ? "bg-foreground text-background" : "text-foreground hover:bg-muted"}`}>{s / 100}%</button>
          ))}
          <input inputMode="decimal" placeholder={tr("Custom")} className="w-20 rounded-lg bg-background px-2 py-1 text-xs outline-none"
            onChange={(e) => { const v = Math.round(parseFloat(e.target.value.replace(",", ".")) * 100); if (v >= 10 && v <= 2000) setSlip(v); }} />
        </div>
      )}

      {/* Je paie */}
      <div className="mt-3 rounded-2xl bg-muted/50 p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{tr("You pay")}</span>
          {spendable != null && (
            <span className="flex items-center gap-1.5">
              <span className="num">{fmt(fromRaw(inBal ?? 0n, inDec))} {inSym}</span>
              {[50, 100].map((p) => <button key={p} onClick={() => setPct(p)} className="rounded-md bg-background px-1.5 py-0.5 font-bold text-foreground">{p === 100 ? "MAX" : `${p}%`}</button>)}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0"
            className="num min-w-0 flex-1 bg-transparent text-[28px] font-bold text-foreground outline-none placeholder:text-muted-foreground/50" />
          {side === "buy" ? <BasePick base={base} setBase={setBase} /> : <span className="flex items-center gap-1.5 rounded-xl bg-background px-2.5 py-1.5 text-sm font-bold"><Logo src={token.logo} sym={token.symbol} />{token.symbol}</span>}
        </div>
      </div>

      {/* Je reçois */}
      <div className="mt-2 rounded-2xl bg-muted/50 p-3">
        <div className="text-xs text-muted-foreground">{tr("You receive")}</div>
        <div className="mt-2 flex items-center gap-2">
          <span className={`num min-w-0 flex-1 truncate text-[28px] font-bold ${quote ? "text-foreground" : "text-muted-foreground/50"}`}>
            {quoting ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : quote ? fmt(outUi) : "0"}
          </span>
          {side === "sell" ? <BasePick base={base} setBase={setBase} /> : <span className="flex items-center gap-1.5 rounded-xl bg-background px-2.5 py-1.5 text-sm font-bold"><Logo src={token.logo} sym={token.symbol} />{token.symbol}</span>}
        </div>
      </div>

      {qErr && <p className="mt-2 px-1 text-xs font-semibold text-down">{tr(qErr)}</p>}

      {quote && (
        <div className="mt-3 space-y-1.5 px-1 text-[13px]">
          <Line k={tr("Minimum received")} v={`${fmt(minUi)} ${outSym}`} />
          <Line k={tr("OM fee")} v={quote.feeBps > 0 ? `${quote.feeBps / 100}% · ${fmt(feeUi)} ${feeSym}` : tr("0% (OM token)")} />
          {quote.priceImpactPct != null && <Line k={tr("Price impact")} v={`${quote.priceImpactPct < 0.01 ? "<0.01" : quote.priceImpactPct.toFixed(2)}%`} warn={impactHigh} />}
          {quote.route.length > 0 && <Line k={tr("Route")} v={quote.route.join(" › ")} />}
        </div>
      )}

      <button onClick={solWallet ? swap : () => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} disabled={disabled}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[16px] font-bold text-background transition-opacity disabled:opacity-40">
        {busy && <Loader2 className="size-4 animate-spin" />}{label}
      </button>
      {token.om_id && (
        <a href={`/launchpad/${token.om_id}`} className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground">{tr("OM token page")}<ExternalLink className="size-3" /></a>
      )}
    </div>
  );
}

function BasePick({ base, setBase }: { base: Base; setBase: (b: Base) => void }) {
  return (
    <div className="flex shrink-0 rounded-xl bg-background p-0.5">
      {(Object.keys(BASES) as Base[]).map((k) => (
        <button key={k} onClick={() => setBase(k)} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${base === k ? "bg-muted text-foreground" : "text-muted-foreground"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BASES[k].logo} alt="" className="size-4 rounded-full" />{k}
        </button>
      ))}
    </div>
  );
}

function Line({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className={`num truncate text-right font-semibold ${warn ? "text-down" : "text-foreground"}`}>{v}</span>
    </div>
  );
}
