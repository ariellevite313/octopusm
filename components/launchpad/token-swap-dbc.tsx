"use client";

/**
 * TokenSwapDBC — on-platform swap widget for Meteora DBC bonding curve tokens.
 * Supports both BUY (SOL → token) and SELL (token → SOL).
 */

import { SolanaMark } from "@/components/shared/solana-mark";
import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { Loader2, Settings2, CheckCircle2, ArrowUpDown } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { getProviderByType } from "@/lib/wallet/adapters";
import { SwapKeypad } from "@/components/launchpad/swap-keypad";
import { XStockIcon } from "@/components/shared/xstock-icon";

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
  poolAddress:       string;
  mintAddress:       string;
  ticker:            string;
  logoUrl?:          string;
  /** If set, the quote token is an xStock (Token-2022) rather than SOL */
  stockSymbol?:      string;
  /** Token-2022 mint address for the xStock quote token */
  quoteMintAddress?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function openWalletModal() {
  window.dispatchEvent(new CustomEvent("open-wallet-connect"));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TokenSwapDBC({ poolAddress, mintAddress, ticker, logoUrl, stockSymbol, quoteMintAddress }: Props) {
  const isXStock = Boolean(stockSymbol && quoteMintAddress);
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
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 text-xs font-semibold text-up hover:bg-emerald-500/20 transition-colors"
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

  const [solBalance,    setSolBalance]   = useState<number | null>(null);  // lamports (always needed for TX fees)
  const [quoteBalance,  setQuoteBalance] = useState<number | null>(null);  // raw units — xStock quote (when isXStock)
  const [quoteDecimals, setQuoteDecimals] = useState(6);                   // xStock decimals (typically 6)
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
    if (!walletAddress) {
      setSolBalance(null); setTokBalance(null); setQuoteBalance(null); return;
    }

    // SOL balance — always needed for TX fees
    fetch(`/api/solana/balance?wallet=${walletAddress}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { lamports: number } | null) => setSolBalance(d?.lamports ?? null))
      .catch(() => setSolBalance(null));

    // Base token balance
    fetch(`/api/solana/balance?wallet=${walletAddress}&mint=${mintAddress}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { raw: number; decimals: number } | null) => {
        setTokBalance(d?.raw ?? 0);
        if (d?.decimals != null) setTokDecimals(d.decimals);
      })
      .catch(() => setTokBalance(null));

    // xStock quote token balance (Token-2022)
    if (isXStock && quoteMintAddress) {
      fetch(`/api/solana/balance?wallet=${walletAddress}&mint=${quoteMintAddress}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: { raw: number; decimals: number } | null) => {
          setQuoteBalance(d?.raw ?? 0);
          if (d?.decimals != null) setQuoteDecimals(d.decimals);
        })
        .catch(() => setQuoteBalance(null));
    }
  }, [walletAddress, mintAddress, isXStock, quoteMintAddress]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  // ── Pool progress ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const fetchProgress = () => {
      // Pass quoteDecimals so the API divides by the correct power of 10:
      // 9 for SOL pools (default), 6 for xStock (Token-2022)
      const qd = isXStock ? 6 : 9;
      fetch(`/api/launchpad/dbc-pool-state?poolAddress=${encodeURIComponent(poolAddress)}&quoteDecimals=${qd}`)
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
      ? isXStock
        ? Math.round(parsed * Math.pow(10, quoteDecimals))   // xStock quote units
        : Math.round(parsed * 1e9)                            // SOL lamports
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
  }, [poolAddress, mintAddress, walletAddress, tokDecimals, isXStock, quoteDecimals]);

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
      if (isXStock) {
        // Quote is xStock — check xStock balance (SOL is always available for TX fees separately)
        const neededRaw = Math.round(parsed * Math.pow(10, quoteDecimals));
        if (quoteBalance !== null && neededRaw > quoteBalance) {
          setError(`Insufficient ${stockSymbol} balance`);
          return;
        }
      } else {
        const neededLamports = Math.round(parsed * 1e9) + 2_000_000; // +0.002 SOL for fees
        if (solBalance !== null && neededLamports > solBalance) {
          setError("Insufficient SOL balance");
          return;
        }
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
        ? isXStock
          ? Math.round(parsed * Math.pow(10, quoteDecimals))  // xStock quote units
          : Math.round(parsed * 1e9)                           // SOL lamports
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

  // Quote token label + balance display
  const quoteLabel = isXStock ? (stockSymbol ?? "xStock") : "SOL";
  const activeBalanceFmt = isBuy
    ? isXStock
      ? (quoteBalance !== null ? `${(quoteBalance / Math.pow(10, quoteDecimals)).toFixed(4)} ${quoteLabel}` : "—")
      : (solBalance  !== null ? `${(solBalance  / 1e9).toFixed(4)} SOL` : "—")
    : (tokBalance !== null ? `${fmtTokens(tokBalance, tokDecimals)} ${ticker}` : "—");

  const outFormatted = estimatedOut != null && estimatedOut > 0
    ? isBuy
      ? `~${fmtTokens(estimatedOut, tokDecimals)} ${ticker}`
      : isXStock
        ? `~${(estimatedOut / Math.pow(10, quoteDecimals)).toFixed(4)} ${quoteLabel}`
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

  /** Renders SOL badge for SOL pools, xStock badge for xStock pools */
  const QuoteBadge = () => isXStock ? (
    <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-full px-3 py-1.5">
      {stockSymbol ? (
        <XStockIcon symbol={stockSymbol} size={20} />
      ) : (
        <div className="size-5 rounded-full bg-blue-500/80 flex items-center justify-center text-[8px] font-bold text-white">
          X
        </div>
      )}
      <span className="text-[13px] font-semibold text-foreground">{quoteLabel}</span>
    </div>
  ) : (
    <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-full px-3 py-1.5">
      <SolanaMark className="size-[18px] text-foreground" />
      <span className="text-[13px] font-semibold text-foreground">SOL</span>
    </div>
  );

  const payLabel = isBuy ? quoteLabel : ticker;

  return (
    <div>

      <div className="space-y-3">

        {/* ── Buy / Sell ── */}
        <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
          {(["buy", "sell"] as Direction[]).map(d => (
            <button
              key={d}
              onClick={() => switchDirection(d)}
              className={`rounded-full py-2.5 text-[14px] font-bold capitalize transition-colors ${
                direction === d
                  ? d === "buy" ? "bg-up text-black" : "bg-down text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* ── Montant ── */}
        <div className="flex flex-col items-center pb-1 pt-5">
          <div className="flex w-full items-baseline justify-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={e => { setAmount(e.target.value.replace(",", ".").replace(/[^0-9.]/g, "")); setActivePct(null); }}
              placeholder="0"
              style={{ width: `${Math.max(1, (amount || "0").length) * 0.62 + 0.1}em` }}
              className="num min-w-0 max-w-[70%] bg-transparent text-center text-[52px] font-bold leading-none tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40"
            />
            <span className="text-[26px] font-bold text-muted-foreground">{payLabel}</span>
          </div>
          <div className="mt-3 flex h-6 items-center text-sm text-muted-foreground">
            {quoteLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : quoteError ? (
              <span>No quote available</span>
            ) : outFormatted ? (
              <span>You receive <span className="num font-semibold text-foreground">{outFormatted}</span></span>
            ) : (
              <span>{amount ? "" : "Enter an amount"}</span>
            )}
          </div>
        </div>

        {/* ── Payer avec ── */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={toggleDirection}
            className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            style={{ transform: spinning ? "scale(0.96)" : "none", transition: "transform 0.2s ease" }}
            title="Switch buy / sell"
          >
            {isBuy ? "Pay with" : "Sell"}
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              {isBuy ? (isXStock
                ? (stockSymbol ? <XStockIcon symbol={stockSymbol} size={16} /> : null)
                : <SolanaMark className="size-4 text-foreground" />)
                // eslint-disable-next-line @next/next/no-img-element
                : (logoUrl ? <img src={logoUrl} alt="" className="size-4 rounded-full object-cover" /> : null)}
              {walletAddress ? activeBalanceFmt : payLabel}
            </span>
            <ArrowUpDown className="size-3.5" />
          </button>
        </div>

        {/* ── % ── */}
        <div className="grid grid-cols-4 gap-2">
          {PCT_SHORTCUTS.map(pct => (
            <button
              key={pct}
              onClick={() => {
                setActivePct(pct);
                let base: number;
                if (isBuy) {
                  if (isXStock) {
                    base = (quoteBalance ?? 0) / Math.pow(10, quoteDecimals);
                  } else {
                    base = (solBalance ?? 0) / 1e9;
                  }
                } else {
                  base = (tokBalance ?? 0) / Math.pow(10, tokDecimals);
                }
                // For SOL 100%, leave 0.002 SOL for fees; xStock has no fee buffer needed
                const effective = (!isXStock && isBuy && pct === 100) ? Math.max(0, base - 0.002) : base;
                setAmount(((effective * pct) / 100).toFixed(isBuy ? 4 : 2));
              }}
              className={`rounded-full py-2.5 text-[13px] font-semibold transition-colors ${
                activePct === pct ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {pct === 100 ? "Max" : `${pct}%`}
            </button>
          ))}
        </div>

        {/* ── Pavé numérique ── */}
        <SwapKeypad value={amount} onChange={(v) => { setAmount(v); setActivePct(null); }} maxDecimals={isBuy ? 4 : 2} />

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
                className={`flex-1 py-1.5 rounded-full text-[12px] font-bold transition-colors border ${
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
              className="flex items-center justify-center gap-1.5 text-[11px] text-up hover:underline"
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
            className="mt-1 w-full rounded-2xl bg-primary py-4 text-[16px] font-bold text-white transition-opacity hover:opacity-90"
          >
            Connect wallet
          </button>
        ) : (
          <button
            onClick={() => void handleSwap()}
            disabled={!quoteReady || swapping || quoteLoading}
            className={`mt-1 w-full rounded-2xl py-4 text-[16px] font-bold transition-colors ${
              !quoteReady || swapping || quoteLoading
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : isBuy
                  ? "bg-primary text-white hover:opacity-90"
                  : "bg-down text-white hover:opacity-90"
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
                {poolProgress.solRaised.toFixed(2)} / {poolProgress.gradThresholdSol.toFixed(0)} {quoteLabel}
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

      </div>
    </div>
  );
}
