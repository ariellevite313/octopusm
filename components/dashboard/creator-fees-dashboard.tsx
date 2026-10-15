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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Copy, Check, HandCoins, Plus, ArrowLeftRight, Send, ChevronRight } from "lucide-react";
import { Transaction, PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { getProviderByType } from "@/lib/wallet/adapters";
import type { CreatorStatsResponse } from "@/app/api/dashboard/creator-stats/route";
import type { PendingFeesResponse, PendingFeeToken } from "@/app/api/dashboard/pending-fees/route";
import { ArcFeesTabs }       from "@/components/dashboard/arc-fees-tabs";
import { ArcHolderHoldings } from "@/components/dashboard/arc-holder-holdings";
import { useT }              from "@/lib/i18n";
import { T }                from "@/lib/i18n-mark";
import { GainsShareSheet }   from "@/components/dashboard/gains-share-sheet";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(n: number, currency = "SOL"): string {
  if (n === 0) return `0 ${currency}`;
  if (n >= 1000) return `${n.toFixed(2)} ${currency}`;
  if (n >= 1)    return `${n.toFixed(4)} ${currency}`;
  return `${n.toFixed(6)} ${currency}`;
}

/** @deprecated use fmtAmount */
function fmtSol(n: number): string { return fmtAmount(n, "SOL"); }

function shortAddr(s: string, h = 4, t = 4) {
  return `${s.slice(0, h)}…${s.slice(-t)}`;
}

type SolanaWallet = {
  publicKey: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (tx: Transaction, opts?: object) => Promise<{ signature: string }>;
};


// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-56 rounded-[28px] bg-muted" />
      <div className="h-20 rounded-2xl bg-muted/60" />
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
  currency = "SOL",
  showClaim = true,
}: {
  token:      PendingFeeToken;
  earned:     number;
  onClaim:    (token: PendingFeeToken) => void;
  claiming:   boolean;
  disabled:   boolean;
  currency?:  string;
  showClaim?: boolean;
}) {
  const { tr } = useT();
  const router = useRouter();
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/launchpad/${token.tokenId}`)}
      onKeyDown={(e) => { if (e.key === "Enter") router.push(`/launchpad/${token.tokenId}`); }}
      className="-mx-2 flex cursor-pointer items-center gap-3.5 rounded-2xl px-2 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="size-12 shrink-0 overflow-hidden rounded-[14px] bg-muted">
        {token.logoUrl ? (
          <Image src={token.logoUrl} alt={token.name} width={48} height={48} className="size-full object-cover" unoptimized />
        ) : (
          <div className="flex size-full items-center justify-center text-xs font-bold text-muted-foreground">
            {token.ticker.slice(0, 2)}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold text-foreground">{token.name}</p>
        <p className="flex items-center gap-2 text-[14px] text-muted-foreground">
          <span>${token.ticker}</span>
          {token.pending > 0 && showClaim && (
            <button
              onClick={(e) => { e.stopPropagation(); onClaim(token); }}
              disabled={claiming || disabled}
              className="num flex items-center gap-1 font-semibold text-primary disabled:opacity-50"
            >
              {claiming && <Loader2 className="size-3 animate-spin" />}
              {claiming ? tr("Claiming…") : `+${fmtAmount(token.pending, currency)}`}
            </button>
          )}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="num text-[15px] font-bold text-foreground">{fmtAmount(earned, currency)}</p>
        <p className="text-[12px] text-muted-foreground">{tr("earned")}</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CreatorFeesDashboard({ walletAddress, displayName = null, avatarSrc = null }: {
  walletAddress: string;
  displayName?:  string | null;
  avatarSrc?:    string | null;
}) {
  const { walletType, selectedChain } = useAuth();
  const { t, tr } = useT();
  const isArc      = selectedChain === "arc";
  const currency   = isArc ? "USDC" : "SOL";
  const fmt        = (n: number) => fmtAmount(n, currency);

  const [stats,       setStats]       = useState<CreatorStatsResponse | null>(null);
  const [pending,     setPending]     = useState<PendingFeesResponse  | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false); // soft refresh — no skeleton
  const [claimingId,  setClaimingId]  = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);
  const [shareOpen,   setShareOpen]   = useState(false);

  const refresh = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else      setLoading(true);
    // Pass ?chain=arc for Arc wallets so creator-stats returns USDC totals, not SOL
    const chainParam = isArc ? "&chain=arc" : "";
    const [s, p] = await Promise.all([
      fetch(`/api/dashboard/creator-stats?wallet=${walletAddress}${chainParam}`).then(r => r.json() as Promise<CreatorStatsResponse>),
      fetch(`/api/dashboard/pending-fees?wallet=${walletAddress}`).then(r => r.json()  as Promise<PendingFeesResponse>),
    ]);
    setStats(s);
    setPending(p);
    setLoading(false);
    setRefreshing(false);
  }, [walletAddress, isArc]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Claim a single token ──────────────────────────────────────────────────

  async function claimToken(token: PendingFeeToken): Promise<boolean> {
    const phantom = (walletType && selectedChain === "solana") ? getProviderByType(walletType) as unknown as SolanaWallet | null : null;
    if (!phantom) { toast.error(t.solanaWalletNotFound); return false; }
    try { await phantom.connect(); } catch { toast.error(t.connectWalletFirst); return false; }
    if (phantom.publicKey?.toBase58() !== walletAddress) {
      toast.error(t.wrongWalletCreator(shortAddr(walletAddress, 4, 4)));
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
      toast.error(e instanceof Error ? tr(e.message) : t.failedToBuildTx);
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
      toast.success(t.claimedFromToken(fmtSol(amount), token.name));

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
      if (!/rejected|cancel/i.test(raw)) toast.error(tr(raw));
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
    try {
      for (let i = 0; i < tokensWithPending.length; i++) {
        // ⚠️ ne pas nommer cette variable "t" : elle masquait les traductions (t.claimingProgress)
        // et faisait planter Claim All avant la première signature.
        const tok = tokensWithPending[i];
        toast.info(t.claimingProgress(i + 1, tokensWithPending.length, tok.name));
        const ok = await claimToken(tok);
        if (ok) claimed++;
      }
    } finally {
      setClaimingAll(false);
    }
    if (claimed > 0) {
      toast.success(t.allFeesClaimed(claimed, tokensWithPending.length));
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

  const name    = displayName || shortAddr(walletAddress, 4, 4);
  const total   = fmtAmount(stats.totalClaimed, currency).split(" ")[0];
  const [intPart, decPart] = total.split(".");
  const totalEarned = mergedTokens.reduce((acc, m) => acc + m.earned, 0);

  return (
    <div className="space-y-8">

      {/* ── Carte solde ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[28px] bg-card p-5 ring-1 ring-border">
        <WaveTexture />

        <div className="relative flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {avatarSrc ? (
              <Image src={avatarSrc} alt="" width={52} height={52} className="size-[52px] shrink-0 rounded-full object-cover" unoptimized />
            ) : (
              <div className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-muted text-lg font-bold text-foreground">
                {name.replace(/^@/, "").slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="truncate text-[19px] font-semibold text-foreground">{name}</span>
            <CopyIcon text={walletAddress} />
          </div>
          <button
            onClick={() => refresh(true)}
            disabled={refreshing}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed"
            title={tr("Refresh")}
          >
            <RefreshCw className={`size-[18px] ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        <p className="relative mt-6 text-[13px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("Total claimed")}</p>
        <p className="num relative mt-1 flex items-baseline gap-2 font-bold leading-none tracking-tight">
          <span className="text-[52px] text-foreground">{intPart}{decPart && <span className="text-muted-foreground">.{decPart}</span>}</span>
          <span className="text-xl text-muted-foreground">{currency}</span>
        </p>
        <p className="num relative mt-3 text-[15px] text-muted-foreground">
          {hasPending
            ? <>+{fmt(pending.total)} <span className="text-primary">{tr("to claim")}</span></>
            : stats.todayClaimed > 0 ? <>+{fmt(stats.todayClaimed)} {tr("today")}</> : <>{tr("Nothing to claim")}</>}
        </p>
      </div>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        <ActionCircle
          label={claimingAll ? T("Claiming") : T("Claim")}
          onClick={!isArc ? handleClaimAll : () => document.getElementById("arc-fees")?.scrollIntoView({ behavior: "smooth" })}
          disabled={!isArc && (claimingAll || hasPendingTokens.length === 0)}
          highlight={!isArc && hasPending}
        >
          {claimingAll ? <Loader2 className="size-6 animate-spin" /> : <HandCoins className="size-6" />}
        </ActionCircle>
        <ActionCircle label={T("Launch")} href="/launchpad/create"><Plus className="size-6" /></ActionCircle>
        <ActionCircle label={T("Trade")} href="/"><ArrowLeftRight className="size-6" /></ActionCircle>
        <ActionCircle label={T("Share")} onClick={() => setShareOpen(true)}><Send className="size-6" /></ActionCircle>
      </div>

      <GainsShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        name={name}
        avatarSrc={avatarSrc}
        walletAddress={walletAddress}
        currency={currency}
        totalClaimed={stats.totalClaimed}
        history={stats.history ?? []}
      />

      {/* ── Arc : onglets Creator fees / Dividendes ─────────────────────── */}
      {isArc && <div id="arc-fees"><ArcFeesTabs /></div>}
      {isArc && <ArcHolderHoldings />}

      {/* ── Tokens lancés ────────────────────────────────────────────────── */}
      {!isArc && (
        <section>
          <Link href={`/profile/${walletAddress}`} className="group inline-flex items-center gap-1">
            <h2 className="text-[28px] font-bold tracking-tight text-foreground">{tr("Tokens launched")}</h2>
            <ChevronRight className="size-6 text-foreground transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
          </Link>
          <p className="num text-[17px] text-muted-foreground">
            {mergedTokens.length !== 1
              ? tr("{count} tokens · {amount} earned", { count: mergedTokens.length, amount: fmt(totalEarned) })
              : tr("{count} token · {amount} earned", { count: mergedTokens.length, amount: fmt(totalEarned) })}
          </p>
          <div className="mt-3">
            {mergedTokens.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">{tr("No token launched yet.")}</p>
            ) : mergedTokens.map(({ token, earned }) => (
              <TokenFeeRow
                key={token.tokenId}
                token={token}
                earned={earned}
                onClaim={handleClaimOne}
                claiming={claimingId === token.tokenId}
                disabled={claimingAll || (claimingId !== null && claimingId !== token.tokenId)}
                currency={currency}
                showClaim={true}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── UI bits ───────────────────────────────────────────────────────────────────

function CopyIcon({ text }: { text: string }) {
  const { tr } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      aria-label={tr("Copy address")}
    >
      {copied ? <Check className="size-[18px]" /> : <Copy className="size-[18px]" />}
    </button>
  );
}

function ActionCircle({ label, href, onClick, disabled, highlight, children }: {
  label: string; href?: string; onClick?: () => void; disabled?: boolean; highlight?: boolean; children: React.ReactNode;
}) {
  const { tr } = useT();
  const circle = (
    <span className={`flex size-[60px] items-center justify-center rounded-full transition-colors ${
      highlight ? "bg-primary text-white" : "bg-muted text-foreground group-hover:bg-muted/70"
    }`}>{children}</span>
  );
  const cls = "group flex flex-col items-center gap-2 disabled:opacity-50";
  const text = <span className="text-[14px] font-medium text-foreground">{tr(label)}</span>;
  if (href) return <Link href={href} className={cls}>{circle}{text}</Link>;
  return <button onClick={onClick} disabled={disabled} className={cls}>{circle}{text}</button>;
}

/** Fines lignes ondulées en fond de carte. */
function WaveTexture() {
  const lines = Array.from({ length: 26 }, (_, i) => i);
  return (
    <svg aria-hidden viewBox="0 0 400 240" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full text-foreground opacity-[0.07]">
      {lines.map(i => {
        const y = -40 + i * 12;
        return (
          <path
            key={i}
            d={`M-20 ${y + 40} C 80 ${y - 10}, 160 ${y + 70}, 260 ${y + 10} S 380 ${y - 30}, 430 ${y + 20}`}
            fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray="2 3"
          />
        );
      })}
    </svg>
  );
}
