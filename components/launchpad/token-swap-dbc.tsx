"use client";

/**
 * TokenSwapDBC — on-platform swap widget for Meteora DBC bonding curve tokens.
 * Supports both BUY (SOL → token) and SELL (token → SOL).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { Loader2, Settings2, CheckCircle2, ArrowUpDown } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { getProviderByType } from "@/lib/wallet/adapters";

// ── Constants ─────────────────────────────────────────────────────────────────

const TOKEN_DECIMALS = 6;
const SLIP_OPTIONS   = [{ label: "0.5%", bps: 50 }, { label: "1%", bps: 100 }, { label: "3%", bps: 300 }];
const PCT_SHORTCUTS  = [25, 50, 75, 100];

function fmtTokens(raw: number, decimals = TOKEN_DECIMALS): string {
  const n = raw / Math.pow(10, decimals);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

function fmtSol(lamports: number): string {
  return (lamports / 1e9).toFixed(4);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Direction = "buy" | "sell";

type Props = {
  poolAddress: string;
  mintAddress: string;
  ticker:      string;
  logoUrl?:    string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function TokenSwapDBC({ poolAddress, mintAddress, ticker, logoUrl }: Props) {
  const { walletAddress, walletType, isAuthenticated } = useAuth();

  const [direction,    setDirection]    = useState<Direction>("buy");
  const [amount,       setAmount]       = useState("");
  const [slippageBps,  setSlippageBps]  = useState(100);
  const [showSlip,     setShowSlip]     = useState(false);
  const [activePct,    setActivePct]    = useState<number | null>(null);

  const [solBalance,   setSolBalance]   = useState<number | null>(null);  // lamports
  const [tokBalance,   setTokBalance]   = useState<number | null>(null);  // raw units
  const [estimatedOut, setEstimatedOut] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError,   setQuoteError]   = useState(false);
  const [swapping,     setSwapping]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [txSig,        setTxSig]        = useState<string | null>(null);
  const [spinning,     setSpinning]     = useState(false);

  const lastTxRef    = useRef<string | null>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isBuy = direction === "buy";

  // ── Balances ────────────────────────────────────────────────────────────────

  const fetchBalances = useCallback(() => {
    if (!walletAddress) { setSolBalance(null); setTokBalance(null); return; }

    fetch(`/api/solana/balance?wallet=${walletAddress}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { lamports: number } | null) => setSolBalance(d?.lamports ?? null))
      .catch(() => setSolBalance(null));

    fetch(`/api/solana/balance?wallet=${walletAddress}&mint=${mintAddress}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { raw: number } | null) => setTokBalance(d?.raw ?? 0))
      .catch(() => setTokBalance(null));
  }, [walletAddress, mintAddress]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  // ── Quote ────────────────────────────────────────────────────────────────────

  const fetchQuote = useCallback(async (amt: string, slip: number, dir: Direction) => {
    const parsed = parseFloat(amt);
    if (!parsed || parsed <= 0 || isNaN(parsed) || !walletAddress) {
      setEstimatedOut(null);
      lastTxRef.current = null;
      return;
    }

    // Convert to raw units
    const amountIn = dir === "buy"
      ? Math.round(parsed * 1e9)                         // SOL → lamports
      : Math.round(parsed * Math.pow(10, TOKEN_DECIMALS)); // tokens → raw

    setQuoteLoading(true);
    setQuoteError(false);
    setTxSig(null);
    setError(null);

    try {
      const res = await fetch("/api/launchpad/dbc-swap", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          poolAddress,
          mintAddress,
          walletAddress,
          amountIn,
          slippageBps: slip,
          swapBaseForQuote: dir === "sell",
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json() as { error?: string };
        throw new Error(msg ?? "Quote failed");
      }
      const data = await res.json() as { txBase64: string; estimatedOut: number };
      lastTxRef.current = data.txBase64;
      setEstimatedOut(data.estimatedOut ?? null);
    } catch {
      setEstimatedOut(null);
      lastTxRef.current = null;
      setQuoteError(true);
    } finally {
      setQuoteLoading(false);
    }
  }, [poolAddress, mintAddress, walletAddress]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchQuote(amount, slippageBps, direction), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [amount, slippageBps, direction, fetchQuote]);

  // ── Toggle direction ─────────────────────────────────────────────────────────

  const toggleDirection = () => {
    setSpinning(true);
    setTimeout(() => setSpinning(false), 400);
    setDirection(d => d === "buy" ? "sell" : "buy");
    setAmount("");
    setActivePct(null);
    setEstimatedOut(null);
    lastTxRef.current = null;
    setError(null);
    setTxSig(null);
  };

  // ── Swap ─────────────────────────────────────────────────────────────────────

  const handleSwap = async () => {
    if (!lastTxRef.current || !walletAddress || !walletType) return;
    const provider = getProviderByType(walletType);
    if (!provider) { setError("Wallet unavailable"); return; }

    // Balance check
    const parsed = parseFloat(amount);
    if (isBuy) {
      const neededLamports = Math.round(parsed * 1e9) + 2_000_000; // +0.002 SOL fees
      if (solBalance !== null && neededLamports > solBalance) {
        setError(`Insufficient SOL balance`);
        return;
      }
    } else {
      const neededRaw = Math.round(parsed * Math.pow(10, TOKEN_DECIMALS));
      if (tokBalance !== null && neededRaw > tokBalance) {
        setError(`Insufficient ${ticker} balance`);
        return;
      }
    }

    setSwapping(true);
    setError(null);
    setTxSig(null);

    try {
      const rawBytes = Buffer.from(lastTxRef.current, "base64");
      let signature: string;

      try {
        const vtx = VersionedTransaction.deserialize(rawBytes);
        if (provider.signAndSendTransaction) {
          const r = await provider.signAndSendTransaction(vtx, { skipPreflight: false, maxRetries: 3 });
          signature = r.signature;
        } else if (provider.signTransaction) {
          const signed = await provider.signTransaction(vtx);
          const { Connection } = await import("@solana/web3.js");
          const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          signature = await conn.sendRawTransaction((signed as any).serialize(), { skipPreflight: false, maxRetries: 3 });
        } else throw new Error("Wallet does not support signing");
      } catch {
        const tx = Transaction.from(rawBytes);
        tx.feePayer = new PublicKey(walletAddress);
        if (provider.signAndSendTransaction) {
          const r = await provider.signAndSendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
          signature = r.signature;
        } else if (provider.signTransaction) {
          const { Connection } = await import("@solana/web3.js");
          const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
          const { blockhash } = await conn.getLatestBlockhash("confirmed");
          tx.recentBlockhash = blockhash;
          const signed = await provider.signTransaction(tx);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          signature = await conn.sendRawTransaction((signed as any).serialize(), { skipPreflight: false, maxRetries: 3 });
        } else throw new Error("Wallet does not support signing");
      }

      setTxSig(signature);
      setAmount("");
      setActivePct(null);
      setEstimatedOut(null);
      lastTxRef.current = null;
      setTimeout(() => fetchBalances(), 2000);
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

  // ── Derived ──────────────────────────────────────────────────────────────────

  const activeBalance    = isBuy ? solBalance : tokBalance;
  const activeBalanceFmt = isBuy
    ? (solBalance !== null ? `${(solBalance / 1e9).toFixed(4)} SOL` : "—")
    : (tokBalance !== null ? `${fmtTokens(tokBalance)} ${ticker}` : "—");

  const outFormatted = estimatedOut != null && estimatedOut > 0
    ? isBuy
      ? `~${fmtTokens(estimatedOut)} ${ticker}`
      : `~${fmtSol(estimatedOut)} SOL`
    : "";

  const hasTx    = !!lastTxRef.current;
  const ctaLabel = !amount
    ? "Enter an amount"
    : isBuy ? `Buy $${ticker}` : `Sell $${ticker}`;

  // ── Render ───────────────────────────────────────────────────────────────────

  const TokenBadge = () => (
    <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={ticker} className="size-5 rounded-full object-cover" />
      ) : (
        <div className="size-5 rounded-full bg-orange-500/80 flex items-center justify-center text-[8px] font-bold text-white">
          {ticker.slice(0, 1)}
        </div>
      )}
      <span className="text-[13px] font-semibold text-white">{ticker}</span>
    </div>
  );

  const SolBadge = () => (
    <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
      <div className="size-5 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] flex items-center justify-center text-[8px] font-bold text-white">S</div>
      <span className="text-[13px] font-semibold text-white">SOL</span>
    </div>
  );

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-[#111111]">

      {/* Banner */}
      <div className="flex items-center gap-2 bg-orange-500/10 border-b border-orange-500/20 px-4 py-2">
        <span className="size-2 rounded-full bg-orange-400 animate-pulse shrink-0" />
        <span className="text-[11px] font-medium text-orange-400">Live on bonding curve</span>
      </div>

      <div className="p-4 space-y-2">

        {/* ── Pay box ── */}
        <div className="rounded-2xl bg-white/5 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-white/40 font-medium">You pay</p>
          <input
            type="number"
            value={amount}
            onChange={e => { setAmount(e.target.value); setActivePct(null); }}
            placeholder="0"
            className="w-full bg-transparent text-[28px] font-semibold text-white outline-none placeholder:text-white/20"
          />
          <div className="flex items-center justify-between mt-1">
            {isBuy ? <SolBadge /> : <TokenBadge />}
            <span className="text-[11px] text-white/30">
              {walletAddress ? `Balance: ${activeBalanceFmt}` : "—"}
            </span>
          </div>
        </div>

        {/* ── Arrow toggle ── */}
        <div className="flex justify-center -my-1 relative z-10">
          <button
            onClick={toggleDirection}
            className="size-9 rounded-full bg-[#1a1a1a] border-2 border-[#111111] flex items-center justify-center text-white/50 hover:text-white transition-colors"
            style={{ transform: spinning ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.35s ease" }}
          >
            <ArrowUpDown className="size-4" />
          </button>
        </div>

        {/* ── Receive box ── */}
        <div className="rounded-2xl bg-white/5 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-white/40 font-medium">You receive</p>
          <div className="min-h-[40px] flex items-center">
            {quoteLoading ? (
              <Loader2 className="size-5 animate-spin text-white/40" />
            ) : quoteError ? (
              <span className="text-[18px] text-white/30">No quote available</span>
            ) : outFormatted ? (
              <span className="text-[28px] font-semibold text-white">{outFormatted}</span>
            ) : (
              <span className="text-[28px] font-semibold text-white/20">0</span>
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            {isBuy ? <TokenBadge /> : <SolBadge />}
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
                const base = isBuy
                  ? (solBalance ?? 0) / 1e9
                  : (tokBalance ?? 0) / Math.pow(10, TOKEN_DECIMALS);
                const effective = (isBuy && pct === 100) ? Math.max(0, base - 0.002) : base;
                setAmount(((effective * pct) / 100).toFixed(isBuy ? 4 : 2));
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
                : isBuy
                  ? "bg-orange-500 hover:bg-orange-400 text-white"
                  : "bg-violet-600 hover:bg-violet-500 text-white"
            }`}
          >
            {swapping ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {isBuy ? "Buying…" : "Selling…"}
              </span>
            ) : ctaLabel}
          </button>
        )}

        <p className="text-center text-[10px] text-white/20 pb-1">
          Powered by Meteora DBC
        </p>

      </div>
    </div>
  );
}
