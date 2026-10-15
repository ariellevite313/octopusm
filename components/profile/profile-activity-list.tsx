"use client";

import { useState } from "react";
import Image from "next/image";
import type { ActivityItem } from "@/services/profile-service";
import { fmt } from "@/lib/format";
import { ListPager } from "./list-pager";

const PAGE_SIZE = 5;

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
      <span className={`min-w-[58px] rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${
        isUp
          ? "bg-up/12 text-up"
          : "bg-down/12 text-down"
      }`}>
        {isUp ? "↑ UP" : "↓ DOWN"}
      </span>
    );
  }
  if (item.market_type === "pool") {
    return (
      <span className="min-w-[58px] rounded-full bg-violet-500/12 px-2 py-0.5 text-center text-[11px] font-semibold text-violet-600 dark:text-violet-400">
        POOL
      </span>
    );
  }
  return (
    <span className="min-w-[58px] rounded-full bg-muted px-2 py-0.5 text-center text-[11px] font-semibold text-muted-foreground">
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
    <section>
      <h2 className="mb-1 text-lg font-bold tracking-tight text-foreground">Recent activity</h2>

      <div>
        {slice.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-3">
            <TypeBadge item={item} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-foreground">{item.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.market_type === "updown" ? "UP/DOWN" : item.market_type === "pool" ? "Pool" : "Prediction"}
                {" · "}
                {timeAgo(item.created_at)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {item.pnl !== 0 ? (
                <p className={`num text-[15px] font-bold ${
                  item.pnl > 0 ? "text-up" : "text-down"
                }`}>
                  {item.pnl > 0 ? "+" : ""}
                  {fmt(item.pnl)}{" "}
                  <span className="text-[10px] font-normal">
                    <TokenDisplay token={item.token} />
                  </span>
                </p>
              ) : (
                <p className="num text-[15px] font-bold text-muted-foreground">
                  {fmt(item.amount)}{" "}
                  <span className="text-[10px] font-normal">
                    <TokenDisplay token={item.token} />
                  </span>
                </p>
              )}
              <p className="text-[11px] capitalize text-muted-foreground">{formatStatus(item.status)}</p>
            </div>
          </div>
        ))}
      </div>

      <ListPager page={page} total={totalPages} onChange={setPage} />
    </section>
  );
}
