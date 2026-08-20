"use client";

/**
 * CreatorFeesDashboard
 *
 * Shows:
 *   1. Orange card — total claimed all-time + today
 *   2. Pending fees bar — total claimable + "Claim All" button
 *   3. Per-token list — fees earned (historical) + pending
 */

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Loader2, RefreshCw, Copy, Check } from "lucide-react";
import { Transaction, PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import type { CreatorStatsResponse } from "@/app/api/dashboard/creator-stats/route";
import type { PendingFeesResponse, PendingFeeToken } from "@/app/api/dashboard/pending-fees/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSol(n: number): string {
  if (n === 0) return "0 SOL";
  if (n >= 1000) return `${n.toFixed(2)} SOL`;
  if (n >= 1)    return `${n.toFixed(4)} SOL`;
  return `${n.toFixed(6)} SOL`;
}

function shortAddr(s: string, h = 4, t = 4) {
  return `${s.slice(0, h)}…${s.slice(-t)}`;
}

type SolanaWallet = {
  publicKey: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (tx: Transaction, opts?: object) => Promise<{ signature: string }>;
};

function getPhantom(): SolanaWallet | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { solana?: SolanaWallet }).solana ?? null;
}

// ── WalletCopyButton ──────────────────────────────────────────────────────────

function WalletCopyButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity"
    >
      <span className="text-sm font-mono font-medium">{short}</span>
      {copied
        ? <Check className="size-3.5" />
        : <Copy className="size-3.5" />}
    </button>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-36 rounded-2xl bg-primary/20" />
      <div className="h-16 rounded-2xl bg-primary/10" />
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 py-3">
          <div className="size-11 rounded-xl bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-28 rounded bg-muted" />
            <div className="h-2.5 w-16 rounded bg-muted/60" />
          </div>
          <div className="h-3 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ── Token row ─────────────────────────────────────────────────────────────────

function TokenFeeRow({
  token,
  earned,
  onClaim,
  claiming,
  disabled,
}: {
  token:    PendingFeeToken;
  earned:   number;
  onClaim:  (token: PendingFeeToken) => void;
  claiming: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
      {/* Logo */}
      <div className="size-11 shrink-0 overflow-hidden rounded-xl bg-muted">
        {token.logoUrl ? (
          <Image src={token.logoUrl} alt={token.name} width={44} height={44} className="size-full object-cover" unoptimized />
        ) : (
          <div className="size-full flex items-center justify-center text-xs font-bold text-muted-foreground">
            {token.ticker.slice(0, 2)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{token.name}</p>
        <p className="text-xs text-muted-foreground">${token.ticker}</p>
      </div>

      {/* Fees */}
      <div className="text-right shrink-0">
        {earned > 0 && (
          <p className="text-[10px] text-muted-foreground">fees earned</p>
        )}
        <p className="text-sm font-bold text-foreground">{fmtSol(earned)}</p>
        {token.pending > 0 && (
          <button
            onClick={() => onClaim(token)}
            disabled={claiming || disabled}
            className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-primary underline underline-offset-2 disabled:opacity-50"
          >
            {claiming && <Loader2 className="size-2.5 animate-spin" />}
            {claiming ? "Claiming…" : `+${fmtSol(token.pending)} pending`}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CreatorFeesDashboard({ walletAddress }: { walletAddress: string }) {
  const [stats,       setStats]       = useState<CreatorStatsResponse | null>(null);
  const [pending,     setPending]     = useState<PendingFeesResponse  | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false); // soft refresh — no skeleton
  const [claimingId,  setClaimingId]  = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);

  const refresh = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else      setLoading(true);
    const [s, p] = await Promise.all([
      fetch(`/api/dashboard/creator-stats?wallet=${walletAddress}`).then(r => r.json() as Promise<CreatorStatsResponse>),
      fetch(`/api/dashboard/pending-fees?wallet=${walletAddress}`).then(r => r.json()  as Promise<PendingFeesResponse>),
    ]);
    setStats(s);
    setPending(p);
    setLoading(false);
    setRefreshing(false);
  }, [walletAddress]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Claim a single token ──────────────────────────────────────────────────

  async function claimToken(token: PendingFeeToken): Promise<boolean> {
    const phantom = getPhantom();
    if (!phantom) { toast.error("Phantom wallet not found"); return false; }
    try { await phantom.connect(); } catch { toast.error("Connect your wallet first"); return false; }
    if (phantom.publicKey?.toBase58() !== walletAddress) {
      toast.error(`Wrong wallet — use …${shortAddr(walletAddress, 4, 4)}`);
      return false;
    }

    // Build tx server-side
    let txBase64: string;
    let claimableSol: number | null = null;
    try {
      const res  = await fetch(`/api/launchpad/${token.tokenId}/claim-fees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const body = await res.json() as { transactionBase64?: string; claimableSol?: number; error?: string };
      if (!res.ok || !body.transactionBase64) throw new Error(body.error ?? "Failed to build tx");
      txBase64     = body.transactionBase64;
      claimableSol = body.claimableSol ?? null;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to build transaction");
      return false;
    }

    // Sign + send
    try {
      const tx = Transaction.from(Buffer.from(txBase64, "base64"));
      let sig = "";
      if (phantom.signAndSendTransaction) {
        const r = await phantom.signAndSendTransaction(tx);
        sig = r.signature;
      } else {
        const signed = await phantom.signTransaction(tx);
        const { Connection } = await import("@solana/web3.js");
        const conn = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.mainnet-beta.solana.com", "confirmed");
        sig = await conn.sendRawTransaction(signed.serialize(), { maxRetries: 3 });
      }

      const amount = claimableSol ?? token.pending;
      toast.success(`${fmtSol(amount)} claimed from ${token.name}`);

      // Log to DB
      if (amount > 0) {
        fetch("/api/dashboard/log-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenId: token.tokenId, walletAddress, amountSol: amount, txSignature: sig }),
        }).catch(() => {});
      }
      return true;
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Transaction failed";
      if (!/rejected|cancel/i.test(raw)) toast.error(raw);
      return false;
    }
  }

  // ── Claim single ──────────────────────────────────────────────────────────

  async function handleClaimOne(token: PendingFeeToken) {
    setClaimingId(token.tokenId);
    const ok = await claimToken(token);
    setClaimingId(null);
    if (ok) await refresh(true); // soft refresh — no skeleton flash
  }

  // ── Claim All ─────────────────────────────────────────────────────────────

  async function handleClaimAll() {
    if (!pending) return;
    const tokensWithPending = pending.tokens.filter(t => t.pending > 0);
    if (tokensWithPending.length === 0) return;

    setClaimingAll(true);
    let claimed = 0;
    for (let i = 0; i < tokensWithPending.length; i++) {
      const t = tokensWithPending[i];
      toast.info(`Claiming ${i + 1}/${tokensWithPending.length} — ${t.name}…`);
      const ok = await claimToken(t);
      if (ok) claimed++;
    }
    setClaimingAll(false);
    if (claimed > 0) {
      toast.success(`All fees claimed (${claimed}/${tokensWithPending.length} tokens)`);
      await refresh(true);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <DashboardSkeleton />;
  if (!stats || !pending) return null;

  const hasPending       = pending.total > 0;
  const hasPendingTokens = pending.tokens.filter(t => t.pending > 0);

  // Merge per-token earned + pending into one list
  const allTokenIds = new Set([
    ...stats.tokens.map(t => t.tokenId),
    ...pending.tokens.map(t => t.tokenId),
  ]);

  const mergedTokens = [...allTokenIds].map(id => {
    const stat = stats.tokens.find(t => t.tokenId === id);
    const pend = pending.tokens.find(t => t.tokenId === id);
    return {
      token:   pend ?? { tokenId: id, name: stat?.name ?? "—", ticker: stat?.ticker ?? "—", logoUrl: stat?.logoUrl ?? null, pending: 0, poolAddress: "" } as PendingFeeToken,
      earned:  stat?.totalEarned ?? 0,
    };
  }).sort((a, b) => (b.earned + b.token.pending) - (a.earned + a.token.pending));

  if (mergedTokens.length === 0) return null;

  return (
    <div className="space-y-4">

      {/* ── Total claimed card ───────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-primary p-5 text-white">

        {/* Header row */}
        <div className="flex items-start justify-between mb-1">
          <p className="text-sm font-semibold opacity-90">Total Claimed</p>
          <button
            onClick={() => refresh(true)}
            disabled={refreshing}
            className="opacity-60 hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
            title="Refresh"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Amount */}
        <div className="flex items-center gap-3 mt-2">
          <div className="size-10 rounded-full bg-black/20 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 32 32" className="size-6 fill-white" aria-hidden>
              <path d="M6.47 21.41a.8.8 0 0 1 .57-.24h17.87a.4.4 0 0 1 .28.68l-2.97 2.97a.8.8 0 0 1-.57.24H3.78a.4.4 0 0 1-.28-.68l2.97-2.97Zm0-13.82A.8.8 0 0 1 7.04 7.35h17.87a.4.4 0 0 1 .28.68l-2.97 2.97a.8.8 0 0 1-.57.24H4.78a.4.4 0 0 1-.28-.68l1.97-1.97Zm17.06 6.88a.8.8 0 0 0-.57-.24H5.09a.4.4 0 0 0-.28.68l2.97 2.97a.8.8 0 0 0 .57.24h17.87a.4.4 0 0 0 .28-.68l-2.97-2.97Z"/>
            </svg>
          </div>
          <span className="text-4xl font-bold tracking-tight">{fmtSol(stats.totalClaimed)}</span>
        </div>

        {stats.todayClaimed > 0 && (
          <p className="mt-1.5 text-sm opacity-80">
            +{fmtSol(stats.todayClaimed)} claimed today
          </p>
        )}

        {/* Bottom row: wallet address + cat icon */}
        <div className="flex items-end justify-between mt-5">
          <WalletCopyButton address={walletAddress} />

          {/* Money cat icon */}
          <div className="size-10 rounded-full bg-black/25 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 36 36" className="size-6 fill-white" aria-hidden>
              {/* Simple cat silhouette with $ */}
              <path d="M7 6 L7 14 Q7 20 13 22 L13 26 Q13 28 15 28 L21 28 Q23 28 23 26 L23 22 Q29 20 29 14 L29 6 L25 10 Q22 8 18 8 Q14 8 11 10 Z" opacity="0.9"/>
              <circle cx="14" cy="15" r="1.5"/>
              <circle cx="22" cy="15" r="1.5"/>
              <text x="18" y="21" textAnchor="middle" fontSize="7" fontWeight="bold" fill="hsl(var(--primary))" fontFamily="sans-serif">$</text>
            </svg>
          </div>
        </div>
      </div>

      {/* ── Pending fees bar ─────────────────────────────────────────────── */}
      {hasPending && (
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-primary/10 border border-primary/20 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 32 32" className="size-4 fill-primary" aria-hidden>
                <path d="M6.47 21.41a.8.8 0 0 1 .57-.24h17.87a.4.4 0 0 1 .28.68l-2.97 2.97a.8.8 0 0 1-.57.24H3.78a.4.4 0 0 1-.28-.68l2.97-2.97Zm0-13.82A.8.8 0 0 1 7.04 7.35h17.87a.4.4 0 0 1 .28.68l-2.97 2.97a.8.8 0 0 1-.57.24H4.78a.4.4 0 0 1-.28-.68l1.97-1.97Zm17.06 6.88a.8.8 0 0 0-.57-.24H5.09a.4.4 0 0 0-.28.68l2.97 2.97a.8.8 0 0 0 .57.24h17.87a.4.4 0 0 0 .28-.68l-2.97-2.97Z"/>
              </svg>
            </div>
            <span className="text-base font-bold text-primary">{fmtSol(pending.total)}</span>
          </div>

          <button
            onClick={handleClaimAll}
            disabled={claimingAll || hasPendingTokens.length === 0}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {claimingAll && <Loader2 className="size-4 animate-spin" />}
            Claim All
          </button>
        </div>
      )}

      {/* ── Per-token list ───────────────────────────────────────────────── */}
      <div>
        {mergedTokens.map(({ token, earned }) => (
          <TokenFeeRow
            key={token.tokenId}
            token={token}
            earned={earned}
            onClaim={handleClaimOne}
            claiming={claimingId === token.tokenId}
            disabled={claimingAll || (claimingId !== null && claimingId !== token.tokenId)}
          />
        ))}
      </div>

    </div>
  );
}
