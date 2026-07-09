"use client";

import { useState } from "react";
import Image from "next/image";
import type { BetHistoryRow } from "@/services/dashboard-service";
import type { PredictionResultStatus } from "@/lib/supabase/types";

function TokenAmount({ token, amount }: { token: string; amount: number }) {
  const isUsdc = token === "usdc";
  return (
    <span className="inline-flex items-center gap-1">
      {isUsdc
        ? amount.toFixed(2)
        : (amount / 1_000_000).toFixed(1) + "M"}
      <Image
        src={isUsdc ? "/usdc-coin.png" : "/clawdtrust-coin.png"}
        alt={isUsdc ? "USDC" : "CLT"}
        width={14}
        height={14}
        className="rounded-full"
      />
    </span>
  );
}

const STATUS_LABEL: Record<PredictionResultStatus, string> = {
  open:                    "Open",
  pending_review:          "Reviewing",
  approved_pending_result: "Awaiting result",
  win:                     "Won",
  lose:                    "Lost",
  claimed:                 "Claimed",
  paid:                    "Paid",
  rejected:                "Rejected",
};

const STATUS_CLASS: Record<PredictionResultStatus, string> = {
  open:                    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  pending_review:          "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  approved_pending_result: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  win:                     "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  lose:                    "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
  claimed:                 "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  paid:                    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  rejected:                "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
};

const PAGE_SIZE = 10;

export function BetHistory({ bets }: { bets: BetHistoryRow[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(bets.length / PAGE_SIZE);
  const slice = bets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section>
      <h2 className="mb-4 text-base font-bold text-foreground">Bet history</h2>

      {bets.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          No bets yet. Place your first prediction!
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="space-y-2 sm:hidden">
            {slice.map((b) => (
              <div key={b.id} className="rounded-2xl border border-border bg-card p-4 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground line-clamp-2">{b.market_title}</p>
                  <StatusBadge status={b.result_status} />
                </div>
                <p className="text-xs text-muted-foreground">{b.selection_label}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-medium text-foreground">
                    <TokenAmount token={b.token} amount={b.amount} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    x{b.payout_multiple ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Market</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selection</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stake</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Odds</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {slice.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">{b.market_title}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[140px] truncate">{b.selection_label}</td>
                    <td className="px-4 py-3 text-right text-foreground">
                      <TokenAmount token={b.token} amount={b.amount} />
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground font-medium">
                      x{b.payout_multiple ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={b.result_status} />
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                      {new Date(b.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: PredictionResultStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
