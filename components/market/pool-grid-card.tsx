"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import type { MutuelMarketRow, MutuelOption } from "@/lib/supabase/types";
import { getCategoryLabel } from "@/lib/categories";

function timeLeft(closesAt: string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}d left`;
  if (h >= 1)  return `${h}h ${m}m left`;
  return `${m}m left`;
}

/**
 * Carte simplifiée pour les mutuel_markets dans la grille unifiée home/catégorie.
 * Pas de barres de probabilité (elles sont sur la page détail /pools/[slug]).
 */
export function PoolGridCard({ market }: { market: MutuelMarketRow }) {
  const options  = (market.options ?? []) as MutuelOption[];
  const isUsdc   = market.bet_token === "usdc";
  const pool     = isUsdc ? market.total_pool_usdc : market.total_pool_clt;
  const token    = isUsdc ? "USDC" : "CLT";
  const decimals = isUsdc ? 2 : 0;
  const href     = `/pools/${market.slug}`;

  return (
    <Link
      href={href}
      className="block overflow-hidden rounded-2xl border border-orange-200 bg-orange-50/60 shadow-none transition-shadow hover:shadow-md dark:border-orange-900/30 dark:bg-orange-950/5"
    >
      <div className="space-y-4 p-5">

        {/* Header */}
        <div className="flex items-start gap-3">
          {market.cover_image_src && (
            <div className="size-10 shrink-0 overflow-hidden rounded-xl border border-orange-200 dark:border-orange-900/40">
              <img
                src={market.cover_image_src}
                alt=""
                className="size-10 object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">
                {getCategoryLabel(market.category)}
              </p>
              <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                MARKET
              </span>
            </div>
            <p className="line-clamp-2 text-sm font-bold leading-snug text-zinc-900 dark:text-zinc-100">
              {market.title}
            </p>
          </div>
        </div>

        {/* Options */}
        <div className={options.length === 2 ? "grid grid-cols-2 gap-2" : "flex flex-col gap-1.5"}>
          {options.slice(0, 4).map((opt) => (
            <div
              key={opt.id}
              className="rounded-xl border border-orange-200 bg-white px-3 py-2 dark:border-orange-900/40 dark:bg-zinc-900"
            >
              <span className="line-clamp-1 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {opt.label}
              </span>
            </div>
          ))}
          {options.length > 4 && (
            <div className="rounded-xl border border-orange-200 bg-white px-3 py-2 dark:border-orange-900/40 dark:bg-zinc-900">
              <span className="text-xs text-zinc-400">+{options.length - 4} more options</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-orange-100 pt-3 text-xs font-medium text-zinc-500 dark:border-orange-900/30 dark:text-zinc-400">
          <span>
            {pool > 0
              ? `${pool.toFixed(decimals)} ${token}`
              : "No predicts yet"}
            {market.bet_count > 0 && ` · ${market.bet_count} predicts`}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {timeLeft(market.betting_closes_at)}
          </span>
        </div>
      </div>
    </Link>
  );
}
