"use client";

/**
 * TokenSwapDBC — on-platform buy widget for tokens still on the Meteora DBC bonding curve.
 *
 * Flow:
 *  1. User enters a SOL amount.
 *  2. We call POST /api/launchpad/dbc-swap (server builds the tx via Meteora DBC SDK).
 *  3. Client signs with their wallet and sends to RPC.
 *
 * Only supports BUYING (SOL → token). Selling on a bonding curve is
 * intentionally not supported (Meteora DBC is buy-only on the curve).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { Loader2, Settings2, CheckCircle2, RotateCcw } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { getProviderByType } from "@/lib/wallet/adapters";

// ── Constants ─────────────────────────────────────────────────────────────────

const RPC_URL      = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const TOKEN_DECIMALS = 6;

const SLIP_OPTIONS  = [{ label: "0.5%", bps: 50 }, { label: "1%", bps: 100 }, { label: "3%", bps: 300 }];
const PCT_SHORTCUTS = [25, 50, 75, 100];

function fmtTokens(rawAmount: number): string {
  const n = rawAmount / Math.pow(10, TOKEN_DECIMALS);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  poolAddress: string;
  mintAddress: string;
  ticker:      string;
};

export function TokenSwapDBC({ poolAddress, mintAddress, ticker }: Props) {
  const { walletAddress, walletType, isAuthenticated } = useAuth();

  const [solAmount,   setSolAmount]   = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [showSlip,    setShowSlip]    = useState(false);
  const [activePct,   setActivePct]   = useState<number | null>(null);

  const [solBalance,   setSolBalance]   = useState<number | null>(null);
  const [estimatedOut, setEstimatedOut] = useState<number | null>(null);  // raw units
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError,   setQuoteError]   = useState(false);
  const [swapping,     setSwapping]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [txSig,        setTxSig]        = useState<string | null>(null);

  // We cache the last-built tx to avoid rebuilding on every sign attempt
  const lastTxRef      = useRef<string | null>(null);  // base64
  const lastLamportsRef = useRef<number>(0);
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch real SOL balance ──────────────────────────────────────────────────
  useEffect(() => {
    if (!walletAddress) { setSolBalance(null); return; }
    const conn = new Connection(RPC_URL, "confirmed");
    conn.getBalance(new PublicKey(walletAddress))
      .then(l => setSolBalance(l / 1e9))
      .catch(() => setSolBalance(null));
  }, [walletAddress]);

  // ── Quote: call server to build tx + get estimate ───────────────────────────
  const fetchQuote = useCallback(async (amount: string, slip: number) => {
    const lamports = Math.round(parseFloat(amount) * 1e9);
    if (!lamports || lamports <= 0 || isNaN(lamports) || !walletAddress) {
      setEstimatedOut(null);
      lastTxRef.current = null;
      return;
    }
    setQuoteLoading(true);
    setQuoteError(false);
    setTxSig(null);
    setError(null);
    try {
      const res = await fetch("/api/launchpad/dbc-swap", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ poolAddress, mintAddress, walletAddress, lamports, slippageBps: slip }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json() as { error?: string };
        throw new Error(msg ?? "Quote failed");
      }
      const data = await res.json() as { txBase64: string; estimatedOut: number };
      lastTxRef.current      = data.txBase64;
      lastLamportsRef.current = lamports;
      setEstimatedOut(data.estimatedOut ?? null);
    } catch {
      setEstimatedOut(null);
      lastTxRef.current = null;
      setQuoteError(true);
    } finally {
      setQuoteLoading(false);
    }
  }, [poolAddress, mintAddress, walletAddress]);

  // Debounce on input change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchQuote(solAmount, slippageBps), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [solAmount, slippageBps, fetchQuote]);

  // ── Swap ────────────────────────────────────────────────────────────────────

  const handleSwap = async () => {
    if (!lastTxRef.current || !walletAddress || !walletType) return;
    const provider = getProviderByType(walletType);
    if (!provider) { setError("Wallet unavailable"); return; }

    // Balance check — leave ~0.002 SOL for fees
    const needed = parseFloat(solAmount) + 0.002;
    if (solBalance !== null && needed > solBalance) {
      setError(`Insufficient balance (${solBalance.toFixed(4)} SOL available)`);
      return;
    }

    setSwapping(true);
    setError(null);
    setTxSig(null);

    try {
      const rawBytes  = Buffer.from(lastTxRef.current, "base64");
      const conn      = new Connection(RPC_URL, "confirmed");

      // Try VersionedTransaction first; fall back to legacy Transaction
      let signature: string;
      try {
        const vtx = VersionedTransaction.deserialize(rawBytes);
        if (provider.signAndSendTransaction) {
          const r = await provider.signAndSendTransaction(vtx, { skipPreflight: false, maxRetries: 3 });
          signature = r.signature;
        } else if (provider.signTransaction) {
          const signed = await provider.signTransaction(vtx);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          signature = await conn.sendRawTransaction((signed as any).serialize(), { skipPreflight: false, maxRetries: 3 });
        } else {
          throw new Error("Wallet does not support transaction signing");
        }
      } catch {
        // Fallback: legacy Transaction
        const tx = Transaction.from(rawBytes);
        tx.feePayer = new PublicKey(walletAddress);
        const { blockhash } = await conn.getLatestBlockhash("confirmed");
        tx.recentBlockhash  = blockhash;

        if (provider.signAndSendTransaction) {
          const r = await provider.signAndSendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
          signature = r.signature;
        } else if (provider.signTransaction) {
          const signed = await provider.signTransaction(tx);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          signature = await conn.sendRawTransaction((signed as any).serialize(), { skipPreflight: false, maxRetries: 3 });
        } else {
          throw new Error("Wallet does not support transaction signing");
        }
      }

      setTxSig(signature);
      setSolAmount("");
      setActivePct(null);
      setEstimatedOut(null);
      lastTxRef.current = null;

      // Refresh balance after swap
      conn.getBalance(new PublicKey(walletAddress))
        .then(l => setSolBalance(l / 1e9))
        .catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Swap failed";
      setError(
        msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel")
          ? "Transaction cancelled"
          : msg,
      );
    } finally {
      setSwapping(false);
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const outFormatted  = estimatedOut != null && estimatedOut > 0 ? fmtTokens(estimatedOut) : "";
  const solBalanceFmt = solBalance !== null ? `${solBalance.toFixed(4)} SOL` : "—";
  const hasTx         = !!lastTxRef.current;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-[#111111]">

      {/* ── Bonding curve info banner ── */}
      <div className="flex items-center gap-2 bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2">
        <span className="size-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span className="text-[11px] font-medium text-emerald-400">Live on bonding curve</span>
      </div>

      <div className="p-4 space-y-2">

        {/* ── Sell box ── */}
        <div className="rounded-2xl bg-white/5 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-white/40 font-medium">You pay</p>
          <input
            type="number"
            value={solAmount}
            onChange={e => { setSolAmount(e.target.value); setActivePct(null); }}
            placeholder="0"
            className="w-full bg-transparent text-[28px] font-semibold text-white outline-none placeholder:text-white/20"
          />
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
              <div className="size-5 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] flex items-center justify-center text-[8px] font-bold text-white">S</div>
              <span className="text-[13px] font-semibold text-white">SOL</span>
            </div>
            <span className="text-[11px] text-white/30">
              {walletAddress ? `Balance: ${solBalanceFmt}` : "—"}
            </span>
          </div>
        </div>

        {/* ── Swap arrow ── */}
        <div className="flex justify-center -my-1 relative z-10">
          <div className="size-9 rounded-full bg-[#1a1a1a] border-2 border-[#111111] flex items-center justify-center text-white/40 cursor-default">
            <RotateCcw className="size-4" />
          </div>
        </div>

        {/* ── Buy box ── */}
        <div className="rounded-2xl bg-white/5 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-white/40 font-medium">You receive</p>
          <div className="min-h-[40px] flex items-center">
            {quoteLoading ? (
              <Loader2 className="size-5 animate-spin text-white/40" />
            ) : quoteError ? (
              <span className="text-[18px] text-white/30">No quote available</span>
            ) : outFormatted ? (
              <span className="text-[28px] font-semibold text-white">~{outFormatted}</span>
            ) : (
              <span className="text-[28px] font-semibold text-white/20">0</span>
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
              <div className="size-5 rounded-full bg-orange-500/80 flex items-center justify-center text-[8px] font-bold text-white">
                {ticker.slice(0, 1)}
              </div>
              <span className="text-[13px] font-semibold text-white">{ticker}</span>
            </div>
            <span className="text-[11px] text-white/30">estimated</span>
          </div>
        </div>

        {/* ── % shortcuts ── */}
        <div className="flex gap-2 pt-1">
          {PCT_SHORTCUTS.map(pct => (
            <button
              key={pct}
              onClick={() => {
                setActivePct(pct);
                const base      = solBalance ?? 0;
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
            Swap confirmed — View on Solscan
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
            disabled={!hasTx || swapping || quoteLoading}
            className={`w-full rounded-full py-4 text-[15px] font-semibold transition-colors mt-1 ${
              !hasTx || swapping || quoteLoading
                ? "bg-white/10 text-white/30 cursor-not-allowed"
                : "bg-orange-500 hover:bg-orange-400 text-white"
            }`}
          >
            {swapping ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Swapping…
              </span>
            ) : !solAmount ? "Enter an amount" : `Buy $${ticker}`}
          </button>
        )}

        <p className="text-center text-[10px] text-white/20 pb-1">
          Powered by Meteora DBC
        </p>

      </div>
    </div>
  );
}
