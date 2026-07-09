"use client";

import { useState, useEffect, useRef } from "react";
import { MutuelMarketRow, MutuelOption } from "@/lib/supabase/types";
import { CheckCircle, XCircle, Trophy, Clock, Users, Ban } from "lucide-react";
import { TokenLogo } from "@/components/shared/token-logo";

// helpers

function fmt(dt: string) {
  return new Date(dt).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_PILL: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  active:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  closed:   "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  resolved: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  rejected:  "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  cancelled: "bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400",
};

// Reject modal

function RejectModal({ onConfirm, onCancel }: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 className="mb-3 text-sm font-bold text-foreground">Rejection reason</h3>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Explain why this pool is rejected..."
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            disabled={!reason.trim()}
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            className="flex-1 rounded-xl bg-destructive py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// Resolve modal

interface BetSummary { option_id: string; amount: number; }

function ResolveModal({ market, onConfirm, onCancel }: {
  market: MutuelMarketRow;
  onConfirm: (optionId: string) => void;
  onCancel: () => void;
}) {
  const options = (market.options ?? []) as MutuelOption[];
  const [selected, setSelected] = useState<string | null>(null);
  const [bets, setBets] = useState<BetSummary[] | null>(null);

  useEffect(() => {
    fetch(`/api/admin/pools/bets?marketId=${market.id}`)
      .then(async r => {
        const d = await r.json();
        if (r.ok && Array.isArray(d)) setBets(d);
        else setBets([]);
      })
      .catch(() => setBets([]));
  }, [market.id]);

  const stakeByOption = (optId: string) =>
    (bets ?? []).filter(b => b.option_id === optId).reduce((s, b) => s + Number(b.amount), 0);

  const selectedHasNoBettors = !!selected && bets !== null && stakeByOption(selected) === 0;
  const totalPool = (bets ?? []).reduce((s, b) => s + Number(b.amount), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 className="mb-1 text-sm font-bold text-foreground">Resolve pool</h3>
        <p className="mb-4 text-xs text-muted-foreground line-clamp-2">{market.title}</p>

        <div className="flex flex-col gap-2 mb-4">
          {options.map(opt => {
            const stake = stakeByOption(opt.id);
            const hasNone = bets !== null && stake === 0;
            return (
              <button
                key={opt.id}
                onClick={() => setSelected(opt.id)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium text-left transition-colors ${
                  selected === opt.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-foreground hover:border-primary/40"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span>{opt.label}</span>
                  {bets !== null && (
                    <span className={`text-xs font-normal ${hasNone ? "text-amber-500" : "text-muted-foreground"}`}>
                      {hasNone ? "no bettors" : `${market.bet_token === "usdc" ? stake.toFixed(2) : Math.floor(stake)} ${market.bet_token === "usdc" ? "USDC" : "CLT"}`}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {selectedHasNoBettors && totalPool > 0 && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            Nobody bet on this option. The full pool ({totalPool.toLocaleString()} {market.bet_token === "usdc" ? "USDC" : "CLT"}) stays with the house - no payouts.
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
            className="flex-1 rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Confirm winner
          </button>
        </div>
      </div>
    </div>
  );
}

// Creation fee refund section (rejected pools)

export function CreationFeeRefundSection({ market, onRefunded }: {
  market: MutuelMarketRow;
  onRefunded: (marketId: string, notes: string) => void;
}) {
  const [acting, setActing] = useState(false);
  const [localRefunded, setLocalRefunded] = useState(false);

  const isAlreadyRefunded = localRefunded || !!(market.admin_notes && market.admin_notes.includes("FEE_REFUNDED:"));

  const dec = market.creation_fee_token === "usdc" ? 2 : 0;
  const tokenName = market.creation_fee_token === "usdc" ? "USDC" : "ClawdTrust";
  const feeNet = Math.floor(Number(market.creation_fee_amount) * 0.95 * 1_000_000) / 1_000_000;

  async function markFeeRefunded() {
    const tx = prompt("Enter refund tx signature (optional, press Cancel to skip):");
    if (tx === null) return; // user cancelled the prompt itself
    setActing(true);
    try {
      const res = await fetch("/api/admin/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_fee_refunded",
          marketId: market.id,
          fee_refund_tx: tx.trim() || null,
        }),
      });
      const data = await res.json() as { error?: string; notes?: string };
      if (!res.ok) { alert(data.error ?? "Error"); return; }
      setLocalRefunded(true);
      onRefunded(market.id, data.notes ?? "");
    } finally {
      setActing(false);
    }
  }

  if (isAlreadyRefunded) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/20">
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Creation fee refunded</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {feeNet.toFixed(dec)} {tokenName} returned to creator
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/20">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
        Creation Fee to Refund
      </p>
      <div className="mb-3 flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Creator</span>
          <span className="font-mono text-foreground">
            {market.creator_wallet.slice(0, 6)}...{market.creator_wallet.slice(-4)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Amount</span>
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <TokenLogo token={market.creation_fee_token} className="size-3" />
            {feeNet.toFixed(dec)} {tokenName}
            <span className="font-normal text-muted-foreground">(after 5% fee)</span>
          </span>
        </div>
        {market.creation_tx && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Original tx</span>
            <a
              href={`https://solscan.io/tx/${market.creation_tx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-500 hover:underline"
            >
              {market.creation_tx.slice(0, 16)}...
            </a>
          </div>
        )}
      </div>
      <button
        onClick={() => void markFeeRefunded()}
        disabled={acting}
        className="w-full rounded-lg bg-red-500 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {acting ? "Saving..." : "Mark fee refunded"}
      </button>
    </div>
  );
}

// Pool row card

function PoolCard({
  market,
  onApprove,
  onReject,
  onResolve,
  onCancel,
  onFeeRefunded,
}: {
  market: MutuelMarketRow;
  onApprove?: () => void;
  onReject?: () => void;
  onResolve?: () => void;
  onCancel?: () => void;
  onFeeRefunded?: (marketId: string, notes: string) => void;
}) {
  const options = (market.options ?? []) as MutuelOption[];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground leading-snug">{market.title}</p>
          {market.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{market.description}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ${STATUS_PILL[market.status]}`}>
          {market.status}
        </span>
      </div>

      {/* Meta */}
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="size-3.5" />
          {market.creator_wallet.slice(0, 6)}...{market.creator_wallet.slice(-4)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" />
          Closes {fmt(market.betting_closes_at)}
        </span>
        <span className="flex items-center gap-1">Fee: <TokenLogo token={market.creation_fee_token} className="size-3" /> {market.creation_fee_amount} {market.creation_fee_token === "usdc" ? "USDC" : "ClawdTrust"}</span>
        <span className="flex items-center gap-1">Pool: <TokenLogo token={market.bet_token} className="size-3" /> {market.bet_token === "usdc" ? market.total_pool_usdc.toFixed(2) : Math.floor(market.total_pool_clt)} {market.bet_token === "usdc" ? "USDC" : "ClawdTrust"}</span>
      </div>

      {/* Options */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {options.map(opt => (
          <span
            key={opt.id}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
              market.winning_option_id === opt.id
                ? "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-400"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            {market.winning_option_id === opt.id && "🏆 "}{opt.label}
          </span>
        ))}
      </div>

      {/* Admin notes */}
      {market.admin_notes && (
        <p className="mb-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          {market.admin_notes}
        </p>
      )}

      {/* Creation fee refund section (rejected pools) */}
      {market.status === "rejected" && onFeeRefunded && (
        <div className="mb-4">
          <CreationFeeRefundSection market={market} onRefunded={onFeeRefunded} />
        </div>
      )}

      {/* Payouts section (resolved + cancelled pools) */}
      {["resolved", "cancelled"].includes(market.status) && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
            Payouts
          </p>
          <PayoutsSection market={market} />
        </div>
      )}

      {/* Pending predictions (active/closed pools) */}
      {["active", "closed"].includes(market.status) && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Predictions awaiting validation
          </p>
          <PendingPredictionsSection
            marketId={market.id}
            marketTitle={market.title}
            betToken={market.bet_token}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {onApprove && (
          <button
            onClick={onApprove}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <CheckCircle className="size-3.5" />
            Approve
          </button>
        )}
        {onReject && (
          <button
            onClick={onReject}
            className="flex items-center gap-1.5 rounded-xl bg-destructive px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <XCircle className="size-3.5" />
            Reject
          </button>
        )}
        {onResolve && (
          <button
            onClick={onResolve}
            className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Trophy className="size-3.5" />
            Resolve
          </button>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition-opacity hover:opacity-90 dark:border-slate-600 dark:text-slate-400"
          >
            <Ban className="size-3.5" />
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// Main component

type Tab = "pending" | "active" | "closed" | "resolved" | "rejected" | "cancelled";

interface Props {
  initialPending: MutuelMarketRow[];
  initialActive: MutuelMarketRow[];
  initialClosed: MutuelMarketRow[];
  initialResolved: MutuelMarketRow[];
  initialRejected: MutuelMarketRow[];
  initialCancelled: MutuelMarketRow[];
}

export function AdminPoolsClient({
  initialPending,
  initialActive,
  initialClosed,
  initialResolved,
  initialRejected,
  initialCancelled,
}: Props) {
  const [tab, setTab] = useState<Tab>("pending");
  const [pools, setPools] = useState<Record<Tab, MutuelMarketRow[]>>({
    pending:   initialPending,
    active:    initialActive,
    closed:    initialClosed,
    resolved:  initialResolved,
    rejected:  initialRejected,
    cancelled: initialCancelled,
  });
  const [rejectTarget, setRejectTarget] = useState<MutuelMarketRow | null>(null);
  const [resolveTarget, setResolveTarget] = useState<MutuelMarketRow | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  // #6 - pending predictions badge: total across ALL active/closed pools
  const [pendingPredictionsCount, setPendingPredictionsCount] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function fetchPendingCount() {
      try {
        const res = await fetch("/api/admin/pools/predictions");
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) setPendingPredictionsCount(data.length);
      } catch { /* silent */ }
    }
    fetchPendingCount();
    pollRef.current = setInterval(fetchPendingCount, 30_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function callAdmin(marketId: string, body: Record<string, unknown>) {
    setLoading(marketId);
    try {
      const res = await fetch("/api/admin/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Error"); return false; }
      return true;
    } finally {
      setLoading(null);
    }
  }

  function moveMarket(id: string, fromTab: Tab, toTab: Tab, patch: Partial<MutuelMarketRow> = {}) {
    setPools(prev => {
      const market = prev[fromTab].find(m => m.id === id);
      if (!market) return prev;
      return {
        ...prev,
        [fromTab]: prev[fromTab].filter(m => m.id !== id),
        [toTab]: [{ ...market, ...patch, status: toTab as MutuelMarketRow["status"] }, ...prev[toTab]],
      };
    });
  }

  function patchMarket(id: string, inTab: Tab, patch: Partial<MutuelMarketRow>) {
    setPools(prev => ({
      ...prev,
      [inTab]: prev[inTab].map(m => m.id === id ? { ...m, ...patch } : m),
    }));
  }

  async function handleApprove(market: MutuelMarketRow) {
    const ok = await callAdmin(market.id, { action: "approve" });
    if (ok) moveMarket(market.id, "pending", "active");
  }

  async function handleReject(market: MutuelMarketRow, reason: string) {
    const ok = await callAdmin(market.id, { action: "reject", reason });
    if (ok) moveMarket(market.id, "pending", "rejected", { admin_notes: reason });
    setRejectTarget(null);
  }

  async function handleResolve(market: MutuelMarketRow, winning_option_id: string) {
    const ok = await callAdmin(market.id, { action: "resolve", winning_option_id });
    if (ok) moveMarket(market.id, market.status as Tab, "resolved", {
      winning_option_id,
      resolved_at: new Date().toISOString(),
    });
    setResolveTarget(null);
  }

  async function handleCancel(market: MutuelMarketRow) {
    if (!confirm("Cancel this pool? All stakes will be refunded.")) return;
    const ok = await callAdmin(market.id, { action: "cancel" });
    if (ok) moveMarket(market.id, market.status as Tab, "cancelled", {
      admin_notes: "Market cancelled by admin, all stakes refunded",
    });
  }

  function handleFeeRefunded(marketId: string, notes: string) {
    patchMarket(marketId, "rejected", { admin_notes: notes });
  }

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "pending",   label: `Pending (${pools.pending.length})` },
    { key: "active",    label: `Active (${pools.active.length})`,   badge: pendingPredictionsCount > 0 ? pendingPredictionsCount : undefined },
    { key: "closed",    label: `Closed (${pools.closed.length})` },
    { key: "resolved",  label: `Resolved (${pools.resolved.length})` },
    { key: "rejected",  label: `Rejected (${pools.rejected.length})` },
    { key: "cancelled", label: `Cancelled (${pools.cancelled.length})` },
  ];

  const current = pools[tab];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">Pools</h1>
        {pendingPredictionsCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
              {pendingPredictionsCount > 99 ? "99+" : pendingPredictionsCount}
            </span>
            prediction{pendingPredictionsCount > 1 ? "s" : ""} awaiting validation
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {badge !== undefined && (
              <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white leading-4">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {current.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center text-muted-foreground">
          <span className="text-4xl">🎱</span>
          <p className="text-sm">No pools in this category.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {current.map(market => (
            <div key={market.id} className={loading === market.id ? "opacity-50 pointer-events-none" : ""}>
              <PoolCard
                market={market}
                onApprove={tab === "pending" ? () => handleApprove(market) : undefined}
                onReject={tab === "pending" ? () => setRejectTarget(market) : undefined}
                onResolve={["active", "closed"].includes(tab) ? () => setResolveTarget(market) : undefined}
                onCancel={["active", "closed"].includes(tab) ? () => handleCancel(market) : undefined}
                onFeeRefunded={tab === "rejected" ? handleFeeRefunded : undefined}
              />
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {rejectTarget && (
        <RejectModal
          onConfirm={reason => handleReject(rejectTarget, reason)}
          onCancel={() => setRejectTarget(null)}
        />
      )}
      {resolveTarget && (
        <ResolveModal
          market={resolveTarget}
          onConfirm={optId => handleResolve(resolveTarget, optId)}
          onCancel={() => setResolveTarget(null)}
        />
      )}
    </div>
  );
}


// Payouts section (resolved pools)

interface WinnerBet {
  id: string;
  wallet_address: string;
  option_id: string;
  amount: number;
  token: string;
  payout_amount: number | null;
  payout_tx: string | null;
  paid_at: string | null;
}

export function PayoutsSection({ market }: { market: MutuelMarketRow }) {
  const [winners, setWinners] = useState<WinnerBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());

  const isRefund = market.status === "cancelled"
    || (market.admin_notes === "REFUND: all bettors chose the winning option, no commission taken");

  useEffect(() => {
    fetch(`/api/admin/pools/bets?marketId=${market.id}&withPayout=1`)
      .then(async r => {
        const d = await r.json();
        if (r.ok && Array.isArray(d)) setWinners(d.filter((b: WinnerBet) => b.payout_amount !== null));
        else setWinners([]);
      })
      .catch(() => setWinners([]))
      .finally(() => setLoading(false));
  }, [market.id]);

  async function markPaid(bet: WinnerBet, payout_tx?: string) {
    setPaying(bet.id);
    try {
      const res = await fetch("/api/admin/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_paid", marketId: market.id, betId: bet.id, payout_tx: payout_tx ?? null }),
      });
      if (res.ok) setPaidIds(prev => new Set([...prev, bet.id]));
      else { const d = await res.json(); alert(d.error ?? "Error"); }
    } finally {
      setPaying(null);
    }
  }

  const dec = market.bet_token === "usdc" ? 2 : 0;
  const tokenName = market.bet_token === "usdc" ? "USDC" : "ClawdTrust";

  if (loading) return <p className="text-xs text-muted-foreground animate-pulse">Loading payouts...</p>;
  if (winners.length === 0) return <p className="text-xs text-muted-foreground">No payouts to process.</p>;

  const unpaid = winners.filter(b => !b.paid_at && !paidIds.has(b.id));
  const paid   = winners.filter(b =>  b.paid_at ||  paidIds.has(b.id));

  return (
    <div className="flex flex-col gap-3">
      {unpaid.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            To pay ({unpaid.length})
          </p>
          {unpaid.map(bet => {
            const gross = Number(bet.payout_amount);
            const net   = isRefund ? Math.floor(gross * 0.95 * 1_000_000) / 1_000_000 : gross;
            return (
              <div
                key={bet.id}
                className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/20 ${paying === bet.id ? "opacity-50 pointer-events-none" : ""}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-foreground">
                      {bet.wallet_address.slice(0, 6)}...{bet.wallet_address.slice(-4)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Staked: {Number(bet.amount).toFixed(dec)} {tokenName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {net.toFixed(dec)} {tokenName}
                    </p>
                    {isRefund && (
                      <p className="text-[10px] text-muted-foreground">after 5% fee</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const tx = prompt("Enter payout tx signature (optional):");
                    await markPaid(bet, tx ?? undefined);
                  }}
                  disabled={paying === bet.id}
                  className="w-full rounded-lg bg-emerald-500 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Mark as paid
                </button>
              </div>
            );
          })}
        </div>
      )}

      {paid.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Paid ({paid.length})
          </p>
          {paid.map(bet => {
            const gross = Number(bet.payout_amount);
            const net   = isRefund ? Math.floor(gross * 0.95 * 1_000_000) / 1_000_000 : gross;
            return (
              <div key={bet.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs">
                <span className="font-mono text-muted-foreground">{bet.wallet_address.slice(0, 6)}...{bet.wallet_address.slice(-4)}</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{net.toFixed(dec)} {tokenName}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Pending predictions section

interface PendingPrediction {
  id: string;
  payment_reference: string;
  market_id: string;
  selection_id: string;
  selection_label: string;
  user_wallet: string;
  amount_usdc: number;
  token: string;
  tx_signature: string | null;
  created_at: string;
  title: string;
}

export function PendingPredictionsSection({ marketId, betToken }: {
  marketId: string;
  marketTitle: string;
  betToken: string;
}) {
  const [predictions, setPredictions] = useState<PendingPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/pools/predictions?marketId=${marketId}`)
      .then(async r => {
        const data = await r.json();
        if (r.ok && Array.isArray(data)) setPredictions(data);
        else setPredictions([]);
      })
      .catch(() => setPredictions([]))
      .finally(() => setLoading(false));
  }, [marketId]);

  async function approve(p: PendingPrediction) {
    setActing(p.id);
    try {
      const res = await fetch("/api/admin/pools/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", paymentId: p.id }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { alert(data.error ?? "Error"); return; }
      setPredictions(prev => prev.filter(x => x.id !== p.id));
    } finally {
      setActing(null);
    }
  }

  async function reject(p: PendingPrediction) {
    if (!confirm("Reject this prediction?")) return;
    setActing(p.id);
    try {
      const res = await fetch("/api/admin/pools/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", paymentId: p.id }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { alert(data.error ?? "Error"); return; }
      setPredictions(prev => prev.filter(x => x.id !== p.id));
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground animate-pulse">Loading predictions...</p>;
  }
  if (predictions.length === 0) {
    return <p className="text-xs text-muted-foreground">No pending predictions.</p>;
  }

  const decimals = betToken === "usdc" ? 2 : 0;

  return (
    <div className="flex flex-col gap-2">
      {predictions.map(p => (
        <div
          key={p.id}
          className={`flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/20 ${acting === p.id ? "opacity-50 pointer-events-none" : ""}`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">{p.selection_label}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <TokenLogo token={p.token} className="size-3" />
              {Number(p.amount_usdc).toFixed(decimals)}
              {" . "}{p.user_wallet.slice(0, 6)}{"..."}{p.user_wallet.slice(-4)}
            </p>
            {p.tx_signature && (
              <a
                href={`https://solscan.io/tx/${p.tx_signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 block truncate font-mono text-[10px] text-blue-500 hover:underline"
              >
                {p.tx_signature.slice(0, 24)}{"..."}
              </a>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => void approve(p)}
              disabled={!!acting}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => void reject(p)}
              disabled={!!acting}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/20"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
