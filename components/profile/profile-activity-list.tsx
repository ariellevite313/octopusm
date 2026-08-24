"use client";

import { useState } from "react";
import Image from "next/image";
import type { ActivityItem } from "@/services/profile-service";
import { fmt } from "@/lib/format";

const PAGE_SIZE = 10;

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diffMs / 3_600_000);
  if (h < 1)  return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatStatus(s: string): string {
  switch (s) {
    case "pending":   return "Pending";
    case "approved":  return "Active";
    case "won":       return "Won";
    case "lost":      return "Lost";
    case "refunded":  return "Refunded";
    case "claimed":   return "Claimed";
    case "paid":      return "Paid";
    case "win":       return "Won";
    case "lose":      return "Lost";
    case "cancelled": return "Cancelled";
    default:          return s;
  }
}

function TypeBadge({ item }: { item: ActivityItem }) {
  if (item.market_type === "updown") {
    const isUp = item.direction_badge === "UP";
    return (
      <span className={`min-w-[58px] rounded-full px-2 py-0.5 text-center text-[10px] font-semibold ${
        isUp
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      }`}>
        {isUp ? "↑ UP" : "↓ DOWN"}
      </span>
    );
  }
  if (item.market_type === "pool") {
    return (
      <span className="min-w-[58px] rounded-full bg-violet-100 px-2 py-0.5 text-center text-[10px] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
        POOL
      </span>
    );
  }
  return (
    <span className="min-w-[58px] rounded-full border border-border bg-muted px-2 py-0.5 text-center text-[10px] font-semibold text-muted-foreground">
      PRED
    </span>
  );
}

function TokenDisplay({ token }: { token: "usdc" | "clt" }) {
  const logo  = token === "usdc" ? "/usdc-coin.png" : "/clawdtrust-coin.png";
  const label = token === "usdc" ? "USDC" : "ClawdTrust";
  return (
    <span className="inline-flex items-center gap-1">
      <Image src={logo} alt={label} width={11} height={11} className="inline-block rounded-full" />
      <span>{label}</span>
    </span>
  );
}

export function ProfileActivityList({ items }: { items: ActivityItem[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const slice = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (items.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Recent activity
        </p>
        {totalPages > 1 && (
          <span className="text-[10px] text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
        )}
      </div>

      <div className="divide-y divide-border">
        {slice.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-3">
            <TypeBadge item={item} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-[10px] text-muted-foreground">
                {item.market_type === "updown" ? "UP/DOWN" : item.market_type === "pool" ? "Pool" : "Prediction"}
                {" · "}
                {timeAgo(item.created_at)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {item.pnl !== 0 ? (
                <p className={`text-sm font-semibold ${
                  item.pnl > 0 ? "text-emerald-600" : "text-red-500"
                }`}>
                  {item.pnl > 0 ? "+" : ""}
                  {fmt(item.pnl)}{" "}
                  <span className="text-[10px] font-normal">
                    <TokenDisplay token={item.token} />
                  </span>
                </p>
              ) : (
                <p className="text-sm font-semibold text-muted-foreground">
                  {fmt(item.amount)}{" "}
                  <span className="text-[10px] font-normal">
                    <TokenDisplay token={item.token} />
                  </span>
                </p>
              )}
              <p className="text-[10px] capitalize text-muted-foreground">{formatStatus(item.status)}</p>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
          >
            ← Previous
          </button>
          <span className="text-[10px] text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, items.length)} of {items.length}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
