"use client";

/**
 * TokenSwap — Jupiter v6 swap widget
 * Design: Market / Limit / Orders tabs, Sell/Buy boxes, % shortcuts, slippage
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { Loader2, Settings2, CheckCircle2, RotateCcw } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { getProviderByType } from "@/lib/wallet/adapters";

// ── Constants ─────────────────────────────────────────────────────────────────

const SOL_MINT = "So11111111111111111111111111111111111111112";
const RPC_URL  = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

const SLIP_OPTIONS  = [{ label: "0.5%", bps: 50 }, { label: "1%", bps: 100 }, { label: "3%", bps: 300 }];
const PCT_SHORTCUTS = [25, 50, 75, 100];

type QuoteResponse = {
  inAmount:       string;
  outAmount:      string;
  priceImpactPct: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  routePlan:      any[];
};

function fmtOut(amount: string, decimals = 6): string {
  const n = parseInt(amount) / Math.pow(10, decimals);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TokenSwap({ mintAddress, ticker }: { mintAddress: string; ticker: string }) {
  const { walletAddress, walletType, isAuthenticated } = useAuth();

  const [tab,         setTab]         = useState<"market" | "limit" | "orders">("market");
  const [solAmount,   setSolAmount]   = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [showSlip,    setShowSlip]    = useState(false);
  const [activePct,   setActivePct]   = useState<number | null>(null);

  const [solBalance,   setSolBalance]   = useState<number | null>(null);
  const [quote,        setQuote]        = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError,   setQuoteError]   = useState(false);
  const [quoteAge,     setQuoteAge]     = useState(0);
  const [swapping,     setSwapping]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [txSig,        setTxSig]        = useState<string | null>(null);

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteAgeRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Quote ───────────────────────────────────────────────────────────────────

  const fetchQuote = useCallback(async (amount: string, slippage: number) => {
    const lamports = Math.round(parseFloat(amount) * 1e9);
    if (!lamports || lamports <= 0 || isNaN(lamports)) { setQuote(null); return; }
    setQuoteLoading(true);
    setQuoteError(false);
    setTxSig(null);
    setError(null);
    try {
      const res = await fetch(
        `https://quote-api.jup.ag/v6/quote` +
        `?inputMint=${SOL_MINT}&outputMint=${mintAddress}` +
        `&amount=${lamports}&slippageBps=${slippage}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) throw new Error("no quote");
      setQuote(await res.json() as QuoteResponse);
    } catch {
      setQuote(null);
      setQuoteError(true);
    } finally {
      setQuoteLoading(false);
    }
  }, [mintAddress]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchQuote(solAmount, slippageBps), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [solAmount, slippageBps, fetchQuote]);

  // ── Fetch real SOL balance ────────────────────────────────────────────────
  useEffect(() => {
    if (!walletAddress) { setSolBalance(null); return; }
    const conn = new Connection(RPC_URL, "confirmed");
    conn.getBalance(new PublicKey(walletAddress))
      .then(lamports => setSolBalance(lamports / 1e9))
      .catch(() => setSolBalance(null));
  }, [walletAddress]);

  // ── Quote age / expiry tracking ──────────────────────────────────────────
  useEffect(() => {
    if (quoteAgeRef.current) clearInterval(quoteAgeRef.current);
    if (!quote) { setQuoteAge(0); return; }
    setQuoteAge(0);
    quoteAgeRef.current = setInterval(() => setQuoteAge(a => a + 1), 1000);
    return () => { if (quoteAgeRef.current) clearInterval(quoteAgeRef.current); };
  }, [quote]);

  // Auto-refresh quote after 28s
  useEffect(() => {
    if (quoteAge >= 28 && solAmount && !quoteLoading) {
      void fetchQuote(solAmount, slippageBps);
    }
  }, [quoteAge, solAmount, slippageBps, quoteLoading, fetchQuote]);

  // ── Swap ────────────────────────────────────────────────────────────────────

  const handleSwap = async () => {
    if (!quote || !walletAddress || !walletType) return;
    const provider = getProviderByType(walletType);
    if (!provider) { setError("Wallet non disponible"); return; }
    // Balance check — leave ~0.002 SOL for fees
    const needed = parseFloat(solAmount) + 0.002;
    if (solBalance !== null && needed > solBalance) {
      setError(`Solde insuffisant (${solBalance.toFixed(4)} SOL disponible)`);
      return;
    }

    setSwapping(true);
    setError(null);
    setTxSig(null);
    try {
      const swapRes = await fetch("https://quote-api.jup.ag/v6/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          quoteResponse: quote, userPublicKey: walletAddress,
          wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: "auto",
        }),
      });
      if (!swapRes.ok) throw new Error("Échec de la transaction");
      const { swapTransaction } = await swapRes.json() as { swapTransaction: string };

      const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
      let signature: string;

      if (provider.signAndSendTransaction) {
        const r = await provider.signAndSendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
        signature = r.signature;
      } else if (provider.signTransaction) {
        const signed = await provider.signTransaction(tx);
        const conn   = new Connection(RPC_URL, "confirmed");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signature = await conn.sendRawTransaction((signed as any).serialize(), { skipPreflight: false, maxRetries: 3 });
      } else {
        throw new Error("Ce wallet ne supporte pas la signature de transactions");
      }

      setTxSig(signature);
      setSolAmount("");
      setActivePct(null);
      setQuote(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Swap échoué";
      setError(msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel") ? "Transaction annulée" : msg);
    } finally {
      setSwapping(false);
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const priceImpact  = quote ? parseFloat(quote.priceImpactPct) : null;
  const highImpact   = priceImpact !== null && priceImpact > 3;
  const outFormatted = quote ? fmtOut(quote.outAmount) : "";
  const solBalanceFmt = solBalance !== null ? `${solBalance.toFixed(4)} SOL` : "—";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-[#111111]">

      {/* ── Tabs ── */}
      <div className="flex items-center border-b border-white/10">
        {(["market", "limit", "orders"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            disabled={t !== "market"}
            className={`flex-1 py-3 text-[13px] font-medium capitalize transition-colors ${
              tab === t
                ? "bg-white/10 text-white"
                : "text-white/40 hover:text-white/60"
            } ${t !== "market" ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {t === "market" ? "Market" : t === "limit" ? "Limit" : "Orders"}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-2">

        {/* ── Sell box ── */}
        <div className="rounded-2xl bg-white/5 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-white/40 font-medium">Sell</p>
          <input
            type="number"
            value={solAmount}
            onChange={e => { setSolAmount(e.target.value); setActivePct(null); }}
            placeholder="0"
            className="w-full bg-transparent text-[28px] font-semibold text-white outline-none placeholder:text-white/20"
          />
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
              {/* SOL icon */}
              <div className="size-5 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] flex items-center justify-center text-[8px] font-bold text-white">S</div>
              <span className="text-[13px] font-semibold text-white">SOL</span>
            </div>
            <span className="text-[11px] text-white/30">
              {walletAddress ? `Solde: ${solBalanceFmt}` : "—"}
            </span>
          </div>
        </div>

        {/* ── Swap direction button ── */}
        <div className="flex justify-center -my-1 relative z-10">
          <div className="size-9 rounded-full bg-[#1a1a1a] border-2 border-[#111111] flex items-center justify-center text-white/40 cursor-default">
            <RotateCcw className="size-4" />
          </div>
        </div>

        {/* ── Buy box ── */}
        <div className="rounded-2xl bg-white/5 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-white/40 font-medium">Buy</p>
          <div className="min-h-[40px] flex items-center">
            {quoteLoading ? (
              <Loader2 className="size-5 animate-spin text-white/40" />
            ) : quoteError ? (
              <span className="text-[18px] text-white/30">Pas de liquidité</span>
            ) : outFormatted ? (
              <span className="text-[28px] font-semibold text-white">{outFormatted}</span>
            ) : (
              <span className="text-[28px] font-semibold text-white/20">0</span>
            )}
          </div>
          <p className="text-[12px] text-white/30">
            {priceImpact !== null && !quoteLoading
              ? <span className={highImpact ? "text-red-400" : "text-white/30"}>Impact: {priceImpact.toFixed(2)}%</span>
              : "$0.00"
            }
          </p>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
              <div className="size-5 rounded-full bg-orange-500/80 flex items-center justify-center text-[8px] font-bold text-white">
                {ticker.slice(0, 1)}
              </div>
              <span className="text-[13px] font-semibold text-white">{ticker}</span>
            </div>
            <span className="text-[11px] text-white/30">0 available</span>
          </div>
        </div>

        {/* ── % shortcuts ── */}
        <div className="flex gap-2 pt-1">
          {PCT_SHORTCUTS.map(pct => (
            <button
              key={pct}
              onClick={() => {
                setActivePct(pct);
                const base = solBalance ?? 0;
                // keep ~0.002 SOL for fees when using 100%
                const effective = pct === 100 ? Math.max(0, base - 0.002) : base;
                setSolAmount(((effective * pct) / 100).toFixed(4));
              }}
              className={`flex-1 py-2 rounded-full text-[12px] font-semibold transition-colors border ${
                activePct === pct
                  ? "bg-orange-500 border-orange-500 text-white"
                  : "bg-white/5 border-white/10 text-white/50 hover:border-white/30 hover:text-white/80"
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* ── Slippage ── */}
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[12px] text-white/40">Slippage</span>
          <button
            onClick={() => setShowSlip(s => !s)}
            className="flex items-center gap-1.5 bg-white/8 hover:bg-white/12 rounded-full px-3 py-1 transition-colors"
          >
            <span className="text-[12px] font-medium text-white/70">
              {SLIP_OPTIONS.find(o => o.bps === slippageBps)?.label ?? "1%"}
            </span>
            <Settings2 className="size-3 text-white/40" />
            <span className="text-[12px] text-white/40">Adjust</span>
          </button>
        </div>

        {/* Slippage picker */}
        {showSlip && (
          <div className="flex gap-2 px-1">
            {SLIP_OPTIONS.map(opt => (
              <button
                key={opt.bps}
                onClick={() => { setSlippageBps(opt.bps); setShowSlip(false); }}
                className={`flex-1 py-1.5 rounded-full text-[12px] font-semibold transition-colors border ${
                  slippageBps === opt.bps
                    ? "bg-orange-500 border-orange-500 text-white"
                    : "bg-white/5 border-white/10 text-white/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Quote expiry warning ── */}
        {quote && quoteAge >= 25 && (
          <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-[11px] text-yellow-400">
            ⏱ Quote expirée — actualisation…
          </div>
        )}

        {/* ── High impact warning ── */}
        {highImpact && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] text-red-400">
            ⚠ Impact élevé ({priceImpact?.toFixed(2)}%) — essaie un montant plus petit.
          </div>
        )}

        {/* ── Error ── */}
        {error && <p className="text-[11px] text-red-400 text-center">{error}</p>}

        {/* ── Success ── */}
        {txSig && (
          <a
            href={`https://solscan.io/tx/${txSig}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-400 hover:underline"
          >
            <CheckCircle2 className="size-3.5" />
            Swap confirmé — Voir sur Solscan
          </a>
        )}

        {/* ── CTA ── */}
        {!isAuthenticated ? (
          <button className="w-full rounded-full py-4 text-[15px] font-semibold bg-orange-500 hover:bg-orange-400 text-white transition-colors mt-1">
            Connect wallet
          </button>
        ) : (
          <button
            onClick={() => void handleSwap()}
            disabled={!quote || swapping || quoteLoading}
            className={`w-full rounded-full py-4 text-[15px] font-semibold transition-colors mt-1 ${
              !quote || swapping || quoteLoading
                ? "bg-white/10 text-white/30 cursor-not-allowed"
                : highImpact
                ? "bg-red-500 hover:bg-red-400 text-white"
                : "bg-orange-500 hover:bg-orange-400 text-white"
            }`}
          >
            {swapping ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Swap en cours…
              </span>
            ) : !solAmount ? "Entrer un montant" : highImpact ? "Acheter quand même" : `Acheter $${ticker}`}
          </button>
        )}

        <p className="text-center text-[10px] text-white/20 pb-1">
          Propulsé par Jupiter
        </p>

      </div>
    </div>
  );
}
