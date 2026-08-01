"use client";

import Link from "next/link";
import Image from "next/image";
import { getCategoryLabel } from "@/lib/categories";
import { formatVolume } from "@/lib/market/utils";
import type { TrendingMarket } from "@/app/api/markets/trending/route";

// Bar colors: first option green, second blue
const BAR_COLORS    = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];
const BORDER_COLORS = ["#16a34a", "#2563eb", "#d97706", "#dc2626"];

export function TrendingCard({ market }: { market: TrendingMarket }) {
  return (
    <Link
      href={market.href}
      className="flex flex-col w-[240px] shrink-0 rounded-2xl border border-orange-200 bg-card p-4 transition-shadow hover:shadow-md dark:border-orange-900/30 snap-start cursor-pointer"
    >
      {/* Header: Option A — image marché à gauche, catégorie + titre à droite */}
      <div className="flex items-start gap-3 mb-4">
        {/* Image du marché (ou placeholder) */}
        {market.img ? (
          <div className="size-9 shrink-0 overflow-hidden rounded-lg border border-border bg-white">
            <Image
              src={market.img}
              alt={market.title}
              width={36}
              height={36}
              className="size-9 object-cover"
            />
          </div>
        ) : (
          <div className="size-9 shrink-0 rounded-lg border border-border bg-muted/40 flex items-center justify-center">
            <span className="text-base">🐙</span>
          </div>
        )}

        {/* Catégorie + titre */}
        <div className="flex-1 min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
            {getCategoryLabel(market.category)}
          </span>
          {/* fixed 2-line height */}
          <div className="h-[2.6rem] overflow-hidden">
            <p className="text-xs font-semibold leading-snug text-foreground line-clamp-2">
              {market.title}
            </p>
          </div>
        </div>
      </div>

      {/* Options with bar + pill */}
      <div className="space-y-2.5 mb-4">
        {market.options.map((opt, i) => {
          const color  = BAR_COLORS[i]   ?? BAR_COLORS[0];
          const border = BORDER_COLORS[i] ?? BORDER_COLORS[0];
          return (
            <div key={opt.id} className="flex items-center gap-2">
              {/* label + bar */}
              <div className="flex-1 min-w-0 space-y-1">
                <span className="block text-[10px] font-medium text-foreground truncate">
                  {opt.label}
                </span>
                <div className="h-[2px] rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${opt.pct}%`, background: color }}
                  />
                </div>
              </div>
              {/* pill */}
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 min-w-[38px] text-center"
                style={{ borderColor: border, color }}
              >
                {opt.pct}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-orange-100 pt-2.5 dark:border-orange-900/30">
        <span className="text-[10px] text-muted-foreground">
          {formatVolume(market.volume_usdc, market.bet_token)}
        </span>
        {market.bet_count > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {market.bet_count} bets
          </span>
        )}
        <span className="text-[10px] font-bold text-accent">Bet →</span>
      </div>
    </Link>
  );
}
