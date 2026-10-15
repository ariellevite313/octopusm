"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import type { MutuelMarketRow, MutuelOption } from "@/lib/supabase/types";
import { getCategoryLabel } from "@/lib/categories";
import { formatVolume } from "@/lib/market/utils";
import { useT } from "@/lib/i18n";

function timeLeft(closesAt: string, tr: (s: string, v?: Record<string, string | number>) => string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return tr("Closed");
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 48) return tr("{d}d left", { d: Math.floor(h / 24) });
  if (h >= 1)  return tr("{h}h {m}m left", { h, m });
  return tr("{m}m left", { m });
}

/**
 * Carte simplifiée pour les mutuel_markets dans la grille unifiée home/catégorie.
 * Pas de barres de probabilité (elles sont sur la page détail /pools/[slug]).
 */
export function PoolGridCard({ market }: { market: MutuelMarketRow }) {
  const { tr } = useT();
  const options  = (market.options ?? []) as MutuelOption[];
  const isUsdc = market.bet_token === "usdc";
  const pool   = isUsdc ? market.total_pool_usdc : market.total_pool_clt;
  const href   = `/pools/${market.slug}`;

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-[22px] border border-border bg-card transition-colors hover:border-primary/40"
    >
      <div className="flex flex-1 flex-col gap-4 p-5">

        {/* Header */}
        <div className="flex items-start gap-3">
          {market.cover_image_src && (
            <div className="size-11 shrink-0 overflow-hidden rounded-2xl bg-muted">
              <img
                src={market.cover_image_src}
                alt=""
                className="size-11 object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {getCategoryLabel(market.category)}
              </p>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {tr("Market")}
              </span>
              {isUsdc ? (
                <span className="rounded-md bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                  USDC
                </span>
              ) : (
                <span className="rounded-md bg-violet-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
                  ClawdTrust
                </span>
              )}
            </div>
            <p className="line-clamp-2 text-[16px] font-bold leading-snug tracking-tight text-foreground">
              {market.title}
            </p>
          </div>
        </div>

        {/* Options — max 3, spacer flex-1 pour hauteur uniforme */}
        <div className="flex flex-1 flex-col gap-1.5">
          {options.slice(0, 3).map((opt) => (
            <div
              key={opt.id}
              className="flex items-center gap-2.5 rounded-2xl bg-muted/70 px-3.5 py-2.5 transition-colors group-hover:bg-muted"
            >
              {opt.image_url && (
                <img
                  src={opt.image_url}
                  alt=""
                  className="size-6 shrink-0 rounded-full object-cover"
                  loading="lazy"
                />
              )}
              <span className="line-clamp-1 text-[13px] font-semibold text-foreground">
                {opt.label}
              </span>
            </div>
          ))}
          {options.length > 3 && (
            <p className="pl-1 text-xs text-muted-foreground">{tr("+{n} more options", { n: options.length - 3 })}</p>
          )}
          <div className="flex-1" />
        </div>

        {/* Footer */}
        <div className="num flex items-center justify-between gap-2 border-t border-border pt-3 text-[13px] font-semibold text-muted-foreground">
          <span>
            {pool > 0
              ? formatVolume(pool, market.bet_token)
              : tr("No predicts yet")}
            {market.bet_count > 0 && ` · ${tr("{n} predicts", { n: market.bet_count })}`}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {timeLeft(market.betting_closes_at, tr)}
          </span>
        </div>
      </div>
    </Link>
  );
}
