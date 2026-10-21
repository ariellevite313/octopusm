"use client";

import { useState } from "react";
import Image from "next/image";
import type { ActivityItem } from "@/services/profile-service";
import { fmt } from "@/lib/format";
import { ListPager } from "./list-pager";
import { useT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n-mark";

type Tr = (s: string, v?: Record<string, string | number>) => string;

const PAGE_SIZE = 5;

function timeAgo(iso: string, tr: Tr, lang: Lang) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diffMs / 3_600_000);
  if (h < 1)  return tr("just now");
  if (h < 24) return tr("{n}h ago", { n: h });
  const d = Math.floor(h / 24);
  if (d < 7)  return tr("{n}d ago", { n: d });
  return new Date(iso).toLocaleDateString(LOCALES[lang], { month: "short", day: "numeric", year: "numeric" });
}

function formatStatus(s: string, tr: Tr): string {
  switch (s) {
    case "pending":   return tr("Pending");
    case "approved":  return tr("Active");
    case "won":       return tr("Won");
    case "lost":      return tr("Lost");
    case "refunded":  return tr("Refunded");
    case "claimed":   return tr("Claimed");
    case "paid":      return tr("Paid");
    case "win":       return tr("Won");
    case "lose":      return tr("Lost");
    case "cancelled": return tr("Cancelled");
    default:          return s;
  }
}

function TypeBadge({ item }: { item: ActivityItem }) {
  const { tr } = useT();
  if (item.market_type === "updown") {
    const isUp = item.direction_badge === "UP";
    return (
      <span className={`min-w-[58px] rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${
        isUp
          ? "bg-up/12 text-up"
          : "bg-down/12 text-down"
      }`}>
        {isUp ? tr("↑ UP") : tr("↓ DOWN")}
      </span>
    );
  }
  if (item.market_type === "pool") {
    return (
      <span className="min-w-[58px] rounded-full bg-violet-500/12 px-2 py-0.5 text-center text-[11px] font-semibold text-violet-600 dark:text-violet-400">
        {tr("POOL")}
      </span>
    );
  }
  return (
    <span className="min-w-[58px] rounded-full bg-muted px-2 py-0.5 text-center text-[11px] font-semibold text-muted-foreground">
      {tr("PRED")}
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

export function ProfileActivityList({ items: allItems, volume }: { items: ActivityItem[]; volume: { usdc: number; clt: number } }) {
  const { tr, lang } = useT();
  const [page, setPage] = useState(0);
  const [tokenFilter, setTokenFilter] = useState<"usdc" | "clt" | null>(null);
  const items = tokenFilter ? allItems.filter(i => i.token === tokenFilter) : allItems;
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const slice = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (allItems.length === 0) return null;

  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight text-foreground">{tr("Recent activity")}</h2>
        <div className="flex gap-1.5">
          {([["usdc", "USDC", "/usdc-coin.png"], ["clt", "ClawdTrust", "/clawdtrust-coin.png"]] as const).map(([k, label, logo]) => (
            <button
              key={k}
              onClick={() => { setTokenFilter(tokenFilter === k ? null : k); setPage(0); }}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-bold transition-colors ${
                tokenFilter === k ? "border-transparent bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Image src={logo} alt="" width={13} height={13} className="rounded-full" />
              {label}
            </button>
          ))}
        </div>
      </div>
      {tokenFilter && (
        <p className="num mb-1 text-[13px] text-muted-foreground">
          {tr("Volume : {amount} {unit}", {
            amount: fmt(tokenFilter === "usdc" ? volume.usdc : volume.clt),
            unit: tokenFilter === "usdc" ? "USDC" : "CLT",
          })}
        </p>
      )}

      <div>
        {slice.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-3">
            <TypeBadge item={item} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-foreground">{item.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.market_type === "updown" ? tr("UP/DOWN") : item.market_type === "pool" ? tr("Pool") : tr("Prediction")}
                {" · "}
                {timeAgo(item.created_at, tr, lang)}
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
              <p className="text-[11px] capitalize text-muted-foreground">{formatStatus(item.status, tr)}</p>
            </div>
          </div>
        ))}
      </div>

      <ListPager page={page} total={totalPages} onChange={setPage} />
    </section>
  );
}
