"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink, Clock, Loader2 } from "lucide-react";
import type { BetHistoryRow } from "@/services/dashboard-service";
import type { PredictionResultStatus } from "@/lib/supabase/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PoolMarket {
  id: string;
  title: string;
  slug: string;
  status: string;
  options: Array<{ id: string; label: string }>;
  bet_token: string;
  winning_option_id: string | null;
  admin_notes: string | null;
}

interface PoolBet {
  id: string;
  market_id: string;
  option_id: string;
  amount: number;
  token: string;
  payout_amount: number | null;
  claimed_at: string | null;
  paid_at: string | null;
  created_at: string;
  mutuel_markets: PoolMarket | null;
}

interface PendingPoolBet {
  id: string;
  market_id: string;
  selection_id: string;
  selection_label: string;
  amount_usdc: number;
  token: string;
  created_at: string;
}

interface PendingMarketBet {
  id: string;
  market_id: string;
  selection_id: string;
  selection_label: string;
  amount_usdc: number;
  token: string;
  title: string;
  created_at: string;
}

// ─── Unified row type ─────────────────────────────────────────────────────────

type UnifiedRow =
  | { kind: "market";          data: BetHistoryRow;      date: number }
  | { kind: "pool";            data: PoolBet;            date: number }
  | { kind: "pool_pending";    data: PendingPoolBet;     date: number }
  | { kind: "market_pending";  data: PendingMarketBet;   date: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TokenAmount({ token, amount }: { token: string; amount: number }) {
  const isUsdc = token === "usdc";
  return (
    <span className="inline-flex items-center gap-1">
      {isUsdc ? amount.toFixed(2) : (amount / 1_000_000).toFixed(1) + "M"}
      <Image
        src={isUsdc ? "/usdc-coin.png" : "/clawdtrust-coin.png"}
        alt={isUsdc ? "USDC" : "CLT"}
        width={14} height={14}
        className="rounded-full"
      />
    </span>
  );
}

function TypeBadge({ kind }: { kind: "market" | "pool" | "pool_pending" }) {
  if (kind === "pool" || kind === "pool_pending")
    return (
      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
        Pool
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
      Market
    </span>
  );
}

const MARKET_STATUS_LABEL: Record<PredictionResultStatus, string> = {
  open:                    "Open",
  pending_review:          "Reviewing",
  approved_pending_result: "Awaiting result",
  win:                     "Won",
  lose:                    "Lost",
  claimed:                 "Claimed",
  paid:                    "Paid",
  rejected:                "Rejected",
};

const MARKET_STATUS_CLASS: Record<PredictionResultStatus, string> = {
  open:                    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  pending_review:          "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  approved_pending_result: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  win:                     "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  lose:                    "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
  claimed:                 "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  paid:                    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  rejected:                "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
};

function poolBetStatus(bet: PoolBet): { label: string; cls: string } {
  const m = bet.mutuel_markets;
  if (!m) return { label: "Unknown", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" };
  if (m.status === "cancelled") {
    if (bet.paid_at) return { label: "Refunded", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" };
    if (bet.claimed_at) return { label: "Claim sent", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" };
    if (bet.payout_amount !== null) return { label: "Claim refund", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" };
    return { label: "Cancelled", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" };
  }
  if (m.status === "resolved") {
    const won = m.winning_option_id === bet.option_id;
    if (!won) return { label: "Lost", cls: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400" };
    if (bet.paid_at) return { label: "Paid", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" };
    if (bet.claimed_at) return { label: "Claim sent", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400" };
    if (bet.payout_amount !== null) return { label: "Claim ready", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" };
    return { label: "Won", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" };
  }
  if (m.status === "closed") return { label: "Awaiting result", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" };
  if (m.status === "active")  return { label: "Active", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" };
  return { label: m.status, cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" };
}

function isClaimable(bet: PoolBet): boolean {
  const m = bet.mutuel_markets;
  if (!m || bet.claimed_at || bet.paid_at || bet.payout_amount === null) return false;
  if (m.status === "resolved") return m.winning_option_id === bet.option_id;
  if (m.status === "cancelled") return true;
  return false;
}

function StatusBadge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const PAGE_SIZE = 10;

// ─── Component ────────────────────────────────────────────────────────────────

export function BetHistory({
  bets,
  walletAddress,
}: {
  bets: BetHistoryRow[];
  walletAddress: string;
}) {
  const [poolBets, setPoolBets]                   = useState<PoolBet[]>([]);
  const [poolPending, setPoolPending]             = useState<PendingPoolBet[]>([]);
  const [marketPending, setMarketPending]         = useState<PendingMarketBet[]>([]);
  const [loadingPool, setLoadingPool]             = useState(true);
  const [claiming, setClaiming]                   = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const loadBets = useCallback(async () => {
    if (!walletAddress) { setLoadingPool(false); return; }
    try {
      const r = await fetch("/api/pools/my-bets");
      if (!r.ok) return;
      const d = await r.json() as { bets: PoolBet[]; pending: PendingPoolBet[]; pendingPredictions: PendingMarketBet[] };
      setPoolBets(d.bets.map((b) => ({
        ...b,
        mutuel_markets: b.mutuel_markets
          ? { ...b.mutuel_markets, options: typeof b.mutuel_markets.options === "string" ? JSON.parse(b.mutuel_markets.options) : b.mutuel_markets.options }
          : null,
      })));
      setPoolPending(d.pending ?? []);
      setMarketPending(d.pendingPredictions ?? []);
    } catch { /* silent */ }
    finally { setLoadingPool(false); }
  }, [walletAddress]);

  useEffect(() => { loadBets(); }, [loadBets]);

  async function handleClaim(betId: string) {
    setClaiming(betId);
    try {
      const res = await fetch("/api/pools/winnings/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betId }),
      });
      if (res.ok) {
        setPoolBets(prev => prev.map(b =>
          b.id === betId ? { ...b, claimed_at: new Date().toISOString() } : b
        ));
      }
    } finally { setClaiming(null); }
  }

  // Build unified sorted list
  const rows: UnifiedRow[] = [
    ...bets.map((b) => ({ kind: "market" as const, data: b, date: new Date(b.created_at).getTime() })),
    ...poolBets.map((b) => ({ kind: "pool" as const, data: b, date: new Date(b.created_at).getTime() })),
    ...poolPending.map((b) => ({ kind: "pool_pending" as const, data: b, date: new Date(b.created_at).getTime() })),
    ...marketPending.map((b) => ({ kind: "market_pending" as const, data: b, date: new Date(b.created_at).getTime() })),
  ].sort((a, b) => b.date - a.date);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const isEmpty = rows.length === 0 && !loadingPool;

  return (
    <section>
      <h2 className="mb-4 text-base font-bold text-foreground">Prediction history</h2>

      {isEmpty ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          No predictions yet. Place your first prediction!
        </div>
      ) : loadingPool && rows.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {slice.map((row) => {
              if (row.kind === "market") {
                const b = row.data;
                return (
                  <div key={b.id} className="rounded-2xl border border-border bg-card p-4 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <TypeBadge kind="market" />
                        <p className="text-xs font-semibold text-foreground line-clamp-1">{b.market_title}</p>
                      </div>
                      <StatusBadge label={MARKET_STATUS_LABEL[b.result_status]} cls={MARKET_STATUS_CLASS[b.result_status]} />
                    </div>
                    <p className="text-xs text-muted-foreground">{b.selection_label}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-medium"><TokenAmount token={b.token} amount={b.amount} /></span>
                      <span className="text-xs text-muted-foreground">x{b.payout_multiple ?? "-"}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(b.created_at)}</span>
                    </div>
                  </div>
                );
              }
              if (row.kind === "pool_pending") {
                const b = row.data;
                return (
                  <div key={b.id} className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-4 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <TypeBadge kind="pool_pending" />
                      <p className="text-xs font-semibold text-foreground line-clamp-1">{b.selection_label}</p>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-medium"><TokenAmount token={b.token} amount={b.amount_usdc} /></span>
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><Clock className="size-3" />Reviewing</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(b.created_at)}</span>
                    </div>
                  </div>
                );
              }
              if (row.kind === "market_pending") {
                const b = row.data;
                return (
                  <div key={b.id} className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-4 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <TypeBadge kind="market" />
                      <p className="text-xs font-semibold text-foreground line-clamp-1">{b.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{b.selection_label}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-medium"><TokenAmount token={b.token} amount={b.amount_usdc} /></span>
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><Clock className="size-3" />Reviewing</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(b.created_at)}</span>
                    </div>
                  </div>
                );
              }
              // pool bet
              const b = row.data;
              const m = b.mutuel_markets;
              const optLabel = m?.options?.find((o) => o.id === b.option_id)?.label ?? b.option_id;
              const { label, cls } = poolBetStatus(b);
              const canClaim = isClaimable(b);
              return (
                <div key={b.id} className="rounded-2xl border border-border bg-card p-4 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <TypeBadge kind="pool" />
                      <p className="text-xs font-semibold text-foreground line-clamp-1">{m?.title ?? "Pool"}</p>
                    </div>
                    <StatusBadge label={label} cls={cls} />
                  </div>
                  <p className="text-xs text-muted-foreground">{optLabel}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-medium"><TokenAmount token={b.token} amount={b.amount} /></span>
                    {m?.slug && <Link href={`/pools/${m.slug}`} className="text-muted-foreground hover:text-foreground"><ExternalLink className="size-3" /></Link>}
                    <span className="text-xs text-muted-foreground">{fmtDate(b.created_at)}</span>
                  </div>
                  {canClaim && (
                    <button
                      onClick={() => handleClaim(b.id)}
                      disabled={claiming === b.id}
                      className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {claiming === b.id ? <Loader2 className="size-3 animate-spin" /> : null}
                      Claim winnings
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["Type", "Market", "Selection", "Stake", "Odds", "Status", "Date"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {slice.map((row) => {
                  if (row.kind === "market") {
                    const b = row.data;
                    return (
                      <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3"><TypeBadge kind="market" /></td>
                        <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate">{b.market_title}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[140px] truncate">{b.selection_label}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><TokenAmount token={b.token} amount={b.amount} /></td>
                        <td className="px-4 py-3 text-muted-foreground">x{b.payout_multiple ?? "-"}</td>
                        <td className="px-4 py-3"><StatusBadge label={MARKET_STATUS_LABEL[b.result_status]} cls={MARKET_STATUS_CLASS[b.result_status]} /></td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(b.created_at)}</td>
                      </tr>
                    );
                  }
                  if (row.kind === "pool_pending") {
                    const b = row.data;
                    return (
                      <tr key={b.id} className="hover:bg-muted/20 transition-colors bg-amber-50/30 dark:bg-amber-950/10">
                        <td className="px-4 py-3"><TypeBadge kind="pool_pending" /></td>
                        <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate">{b.selection_label}</td>
                        <td className="px-4 py-3 text-muted-foreground">-</td>
                        <td className="px-4 py-3 whitespace-nowrap"><TokenAmount token={b.token} amount={b.amount_usdc} /></td>
                        <td className="px-4 py-3 text-muted-foreground">-</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                            <Clock className="size-3" />Reviewing
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(b.created_at)}</td>
                      </tr>
                    );
                  }
                  if (row.kind === "market_pending") {
                    const b = row.data;
                    return (
                      <tr key={b.id} className="hover:bg-muted/20 transition-colors bg-amber-50/30 dark:bg-amber-950/10">
                        <td className="px-4 py-3"><TypeBadge kind="market" /></td>
                        <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate">{b.title}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[140px] truncate">{b.selection_label}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><TokenAmount token={b.token} amount={b.amount_usdc} /></td>
                        <td className="px-4 py-3 text-muted-foreground">-</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                            <Clock className="size-3" />Reviewing
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(b.created_at)}</td>
                      </tr>
                    );
                  }
                  // pool bet
                  const b = row.data;
                  const m = b.mutuel_markets;
                  const optLabel = m?.options?.find((o) => o.id === b.option_id)?.label ?? b.option_id;
                  const { label, cls } = poolBetStatus(b);
                  const canClaim = isClaimable(b);
                  return (
                    <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3"><TypeBadge kind="pool" /></td>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[180px]">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">{m?.title ?? "Pool"}</span>
                          {m?.slug && <Link href={`/pools/${m.slug}`} className="shrink-0 text-muted-foreground hover:text-foreground"><ExternalLink className="size-3" /></Link>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[140px] truncate">{optLabel}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><TokenAmount token={b.token} amount={b.amount} /></td>
                      <td className="px-4 py-3 text-muted-foreground">-</td>
                      <td className="px-4 py-3">
                        {canClaim ? (
                          <button
                            onClick={() => handleClaim(b.id)}
                            disabled={claiming === b.id}
                            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {claiming === b.id ? <Loader2 className="size-3 animate-spin" /> : null}
                            Claim
                          </button>
                        ) : (
                          <StatusBadge label={label} cls={cls} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(b.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40">
                Previous
              </button>
              <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40">
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
