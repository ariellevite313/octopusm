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

const SLIP_OPTIONS  = [{ label: "0.5%", bps: 50 }, { label: "1%", bps: 100 }, { label: "3%", bps: 300 }];
const PCT_SHORTCUTS = [25, 50, 75, 100];

function fmtTokens(raw: number, decimals: number): string {
  const n       = raw / Math.pow(10, decimals);
  const rounded = Math.floor(n);
  return rounded.toLocaleString("en-US");
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function openWalletModal() {
  window.dispatchEvent(new CustomEvent("open-wallet-connect"));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TokenSwapDBC({ poolAddress, mintAddress, ticker, logoUrl }: Props) {
  const { walletAddress, walletType, selectedChain, isAuthenticated } = useAuth();

  // Solana tokens require a Solana wallet
  if (isAuthenticated && selectedChain !== "solana") {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">Solana wallet required</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          This token runs on Solana.<br />
          Connect a Solana wallet (Phantom, Solflare…) to trade.
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          Switch wallet
        </button>
      </div>
    );
  }

  const [direction,    setDirection]    = useState<Direction>("buy");
  const [amount,       setAmount]       = useState("");
  const [slippageBps,  setSlippageBps]  = useState(100);
  const [showSlip,     setShowSlip]     = useState(false);
  const [activePct,    setActivePct]    = useState<number | null>(null);

  const [solBalance,   setSolBalance]   = useState<number | null>(null);  // lamports
  const [tokBalance,   setTokBalance]   = useState<number | null>(null);  // raw units
  const [tokDecimals,  setTokDecimals]  = useState(6);                    // dynamic from balance API
  const [estimatedOut, setEstimatedOut] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError,   setQuoteError]   = useState(false);
  const [swapping,     setSwapping]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [txSig,        setTxSig]        = useState<string | null>(null);
  const [spinning,     setSpinning]     = useState(false);
  const [omeroEarned,  setOmeroEarned]  = useState<number | null>(null);

  // ── Pool graduation progress ─────────────────────────────────────────────────
  const [poolProgress, setPoolProgress] = useState<{
    solRaised: number; gradThresholdSol: number; progressPct: number; graduated: boolean;
  } | null>(null);

  // quoteReady: true if the last quote fetch succeeded and the amount hasn't changed since
  const [quoteReady,   setQuoteReady]   = useState(false);
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      .then((d: { raw: number; decimals: number } | null) => {
        setTokBalance(d?.raw ?? 0);
        if (d?.decimals != null) setTokDecimals(d.decimals);
      })
      .catch(() => setTokBalance(null));
  }, [walletAddress, mintAddress]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  // ── Pool progress ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const fetchProgress = () => {
      fetch(`/api/launchpad/dbc-pool-state?poolAddress=${encodeURIComponent(poolAddress)}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: { solRaised: number; gradThresholdSol: number; progressPct: number; graduated: boolean } | null) => {
          if (!cancelled && d && d.gradThresholdSol > 0) setPoolProgress(d);
        })
        .catch(() => { /* non-fatal */ });
    };
    fetchProgress();
    const interval = setInterval(fetchProgress, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [poolAddress]);

  // ── Quote ────────────────────────────────────────────────────────────────────
  // Only fetches the estimated output — the actual tx is always built fresh at swap time.

  const fetchQuote = useCallback(async (amt: string, slip: number, dir: Direction) => {
    const parsed = parseFloat(amt);
    if (!parsed || parsed <= 0 || isNaN(parsed) || !walletAddress) {
      setEstimatedOut(null);
      setQuoteReady(false);
      return;
    }

    const amountIn = dir === "buy"
      ? Math.round(parsed * 1e9)
      : Math.round(parsed * Math.pow(10, tokDecimals));

    if (amountIn < 1) { setEstimatedOut(null); setQuoteReady(false); return; }

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
      const data = await res.json() as { estimatedOut: number };
      setEstimatedOut(data.estimatedOut ?? null);
      setQuoteReady(true);
    } catch {
      setEstimatedOut(null);
      setQuoteReady(false);
      setQuoteError(true);
    } finally {
      setQuoteLoading(false);
    }
  }, [poolAddress, mintAddress, walletAddress, tokDecimals]);

  useEffect(() => {
    setQuoteReady(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchQuote(amount, slippageBps, direction), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [amount, slippageBps, direction, fetchQuote]);

  // ── Toggle direction ─────────────────────────────────────────────────────────

  const switchDirection = (d: Direction) => {
    if (d === direction) return;
    setSpinning(true);
    setTimeout(() => setSpinning(false), 400);
    setDirection(d);
    setAmount("");
    setActivePct(null);
    setEstimatedOut(null);
    setQuoteReady(false);
    setQuoteError(false); // ← reset sinon "No quote available" reste affiché
    setError(null);
    setTxSig(null);
  };

  const toggleDirection = () => switchDirection(direction === "buy" ? "sell" : "buy");

  // ── Swap ─────────────────────────────────────────────────────────────────────
  // Always builds a fresh transaction at click time to avoid stale blockhash.

  const handleSwap = async () => {
    if (!quoteReady || !walletAddress || !walletType) return;
    const provider = getProviderByType(walletType);
    if (!provider) { setError("Wallet unavailable"); return; }

    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;

    // Balance check
    if (isBuy) {
      const neededLamports = Math.round(parsed * 1e9) + 2_000_000; // +0.002 SOL for fees
      if (solBalance !== null && neededLamports > solBalance) {
        setError("Insufficient SOL balance");
        return;
      }
    } else {
      const neededRaw = Math.round(parsed * Math.pow(10, tokDecimals));
      if (tokBalance !== null && neededRaw > tokBalance) {
        setError(`Insufficient ${ticker} balance`);
        return;
      }
    }

    setSwapping(true);
    setError(null);
    setTxSig(null);

    try {
      // Fresh transaction with a new blockhash — avoids expiry if user waited
      const amountIn = isBuy
        ? Math.round(parsed * 1e9)
        : Math.round(parsed * Math.pow(10, tokDecimals));

      const swapRes = await fetch("/api/launchpad/dbc-swap", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          poolAddress,
          mintAddress,
          walletAddress,
          amountIn,
          slippageBps,
          swapBaseForQuote: !isBuy,
        }),
      });

      if (!swapRes.ok) {
        const { error: msg } = await swapRes.json() as { error?: string };
        throw new Error(msg ?? "Failed to build transaction");
      }

      const { txBase64 } = await swapRes.json() as { txBase64: string };
      const rawBytes = Buffer.from(txBase64, "base64");
      let signature: string;

      try {
        const vtx = VersionedTransaction.deserialize(rawBytes);
        if (provider.signAndSendTransaction) {
          const r = await provider.signAndSendTransaction(vtx, { skipPreflight: false, maxRetries: 3 });
          signature = r.signature;
        } else if (provider.signTransaction) {
          const signed = await provider.signTransaction(vtx);
          const { Connection } = await import("@solana/web3.js");
          const conn = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
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
          const conn = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
          const { blockhash } = await conn.getLatestBlockhash("confirmed");
          tx.recentBlockhash = blockhash;
          const signed = await provider.signTransaction(tx);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          signature = await conn.sendRawTransaction((signed as any).serialize(), { skipPreflight: false, maxRetries: 3 });
        } else throw new Error("Wallet does not support signing");
      }

      setTxSig(signature!);
      setAmount("");
      setActivePct(null);
      setEstimatedOut(null);
      setQuoteReady(false);
      setTimeout(() => fetchBalances(), 2000);

      // Reward OMERO for buy swaps (fire-and-forget — errors don't affect UX)
      if (isBuy) {
        void fetch("/api/launchpad/dbc-swap/reward", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            txSignature:   signature,
            walletAddress,
            amountLamports: amountIn,
          }),
        })
          .then(r => r.ok ? r.json() : null)
          .then((d: { omeroAwarded?: number } | null) => {
            if (d?.omeroAwarded && d.omeroAwarded > 0) {
              // Small toast-like state to show reward
              setOmeroEarned(d.omeroAwarded);
              setTimeout(() => setOmeroEarned(null), 5000);
            }
          })
          .catch(() => { /* ignore — reward is best-effort */ });
      }
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

  const activeBalanceFmt = isBuy
    ? (solBalance !== null ? `${(solBalance / 1e9).toFixed(4)} SOL` : "—")
    : (tokBalance !== null ? `${fmtTokens(tokBalance, tokDecimals)} ${ticker}` : "—");

  const outFormatted = estimatedOut != null && estimatedOut > 0
    ? isBuy
      ? `~${fmtTokens(estimatedOut, tokDecimals)} ${ticker}`
      : `~${fmtSol(estimatedOut)} SOL`
    : "";

  const ctaLabel = !amount
    ? "Enter an amount"
    : isBuy ? `Buy $${ticker}` : `Sell $${ticker}`;

  // ── Render ───────────────────────────────────────────────────────────────────

  const TokenBadge = () => (
    <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-full px-3 py-1.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={ticker} className="size-5 rounded-full object-cover" />
      ) : (
        <div className="size-5 rounded-full bg-orange-500/80 flex items-center justify-center text-[8px] font-bold text-white">
          {ticker.slice(0, 1)}
        </div>
      )}
      <span className="text-[13px] font-semibold text-foreground">{ticker}</span>
    </div>
  );

  const SolBadge = () => (
    <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-full px-3 py-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/solana.png" alt="SOL" className="size-5 rounded-full object-cover" />
      <span className="text-[13px] font-semibold text-foreground">SOL</span>
    </div>
  );

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card">

      <div className="p-4 space-y-2">

        {/* ── Buy / Sell tabs ── */}
        <div className="flex rounded-xl overflow-hidden border border-border">
          {(["buy", "sell"] as Direction[]).map(d => (
            <button
              key={d}
              onClick={() => switchDirection(d)}
              className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors capitalize ${
                direction === d
                  ? d === "buy"
                    ? "bg-emerald-500 text-white"
                    : "bg-red-500 text-white"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* ── Pay box ── */}
        <div className="rounded-2xl bg-muted/40 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-muted-foreground font-medium">You pay</p>
          <input
            type="number"
            value={amount}
            onChange={e => { setAmount(e.target.value); setActivePct(null); }}
            placeholder="0"
            className="w-full bg-transparent text-[28px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/30"
          />
          <div className="flex items-center justify-between mt-1">
            {isBuy ? <SolBadge /> : <TokenBadge />}
            <span className="text-[11px] text-muted-foreground/60">
              {walletAddress ? `Balance: ${activeBalanceFmt}` : "—"}
            </span>
          </div>
        </div>

        {/* ── Arrow toggle ── */}
        <div className="flex justify-center -my-1 relative z-10">
          <button
            onClick={toggleDirection}
            className="size-9 rounded-full bg-muted border-2 border-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            style={{ transform: spinning ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.35s ease" }}
          >
            <ArrowUpDown className="size-4" />
          </button>
        </div>

        {/* ── Receive box ── */}
        <div className="rounded-2xl bg-muted/40 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-muted-foreground font-medium">You receive</p>
          <div className="min-h-[40px] flex items-center">
            {quoteLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : quoteError ? (
              <span className="text-[18px] text-muted-foreground/50">No quote available</span>
            ) : outFormatted ? (
              <span className="text-[28px] font-semibold text-foreground">{outFormatted}</span>
            ) : (
              <span className="text-[28px] font-semibold text-muted-foreground/30">0</span>
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            {isBuy ? <TokenBadge /> : <SolBadge />}
            <span className="text-[11px] text-muted-foreground/60">estimated</span>
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
                  : (tokBalance ?? 0) / Math.pow(10, tokDecimals);
                const effective = (isBuy && pct === 100) ? Math.max(0, base - 0.002) : base;
                setAmount(((effective * pct) / 100).toFixed(isBuy ? 4 : 2));
              }}
              className={`flex-1 py-2 rounded-full text-[12px] font-semibold transition-colors border ${
                activePct === pct
                  ? "bg-orange-500 border-orange-500 text-white"
                  : "bg-muted/40 border-border text-muted-foreground hover:border-border-strong hover:text-foreground"
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* ── Slippage ── */}
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[12px] text-muted-foreground">Slippage</span>
          <button
            onClick={() => setShowSlip(s => !s)}
            className="flex items-center gap-1.5 bg-muted/50 hover:bg-muted rounded-full px-3 py-1 transition-colors"
          >
            <span className="text-[12px] font-medium text-foreground/70">
              {SLIP_OPTIONS.find(o => o.bps === slippageBps)?.label ?? "1%"}
            </span>
            <Settings2 className="size-3 text-muted-foreground" />
            <span className="text-[12px] text-muted-foreground">Adjust</span>
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
                    : "bg-muted/40 border-border text-muted-foreground"
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
          <div className="space-y-1">
            <a
              href={`https://solscan.io/tx/${txSig}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-400 hover:underline"
            >
              <CheckCircle2 className="size-3.5" />
              Swap confirmed — View on Solscan
            </a>
            {omeroEarned != null && omeroEarned > 0 && (
              <div className="flex items-center justify-center gap-1.5 animate-pulse">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/octo-coin.png" alt="OMERO" className="size-4 rounded-full object-cover" />
                <span className="text-[11px] font-semibold text-orange-400">
                  +{omeroEarned.toLocaleString("en-US")} OMERO earned
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── CTA ── */}
        {!isAuthenticated ? (
          <button
            onClick={openWalletModal}
            className="w-full rounded-full py-4 text-[15px] font-semibold bg-orange-500 hover:bg-orange-400 text-white transition-colors mt-1"
          >
            Connect wallet
          </button>
        ) : (
          <button
            onClick={() => void handleSwap()}
            disabled={!quoteReady || swapping || quoteLoading}
            className={`w-full rounded-full py-4 text-[15px] font-semibold transition-colors mt-1 ${
              !quoteReady || swapping || quoteLoading
                ? "bg-muted text-muted-foreground cursor-not-allowed"
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

        {/* ── Graduation progress bar ── */}
        {poolProgress && !poolProgress.graduated && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/60 font-medium">Bonding curve</span>
              <span className="text-[10px] text-muted-foreground/60 font-medium tabular-nums">
                {poolProgress.solRaised.toFixed(2)} / {poolProgress.gradThresholdSol.toFixed(0)} SOL
                <span className="ml-1 text-orange-400 font-semibold">{poolProgress.progressPct.toFixed(1)}%</span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-700"
                style={{ width: `${Math.min(100, poolProgress.progressPct)}%` }}
              />
            </div>
          </div>
        )}
        {poolProgress?.graduated && (
          <p className="text-[10px] text-center text-indigo-400 font-semibold pt-1">🎓 Graduated to DAMM</p>
        )}

        <p className="text-center text-[10px] text-muted-foreground/40 pb-1">
          Powered by Meteora DBC
        </p>

      </div>
    </div>
  );
}
