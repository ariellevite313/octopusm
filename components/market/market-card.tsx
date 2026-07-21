"use client";

import Link from "next/link";
import { MarketCountdownBadge } from "./market-countdown";
import { useFakeLiveBets, FakeBetOverlay } from "./market-fake-bets";
import { parseMarketOptions, type MarketVolumes } from "@/lib/market/utils";
import type { PredictionMarketRow } from "@/lib/supabase/types";

type Props = {
  market: PredictionMarketRow;
  volumes?: MarketVolumes;
};

export function MarketCard({ market, volumes }: Props) {
  const options = parseMarketOptions(market.options);
  const vol = volumes?.[market.id];
  const fakeBets = useFakeLiveBets(options.length, false);
  const href = `/prediction/${market.slug ?? market.id}`;

  return (
    <Link href={href} className="block overflow-hidden rounded-2xl border border-orange-200 bg-orange-50/60 shadow-none transition-shadow hover:shadow-md dark:border-orange-900/30 dark:bg-orange-950/5">
      <div className="space-y-4 p-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">
              {market.title}
            </p>
            <div className="mt-1.5">
              <MarketVisual market={market} />
            </div>
          </div>
          {market.event_start_at && (
            <MarketCountdownBadge eventStartAt={market.event_start_at} />
          )}
        </div>

        {/* Options */}
        {options.length > 0 && (
          <div
            className={
              options.length === 3
                ? "flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0"
                : "grid grid-cols-2 gap-2"
            }
          >
            {options.map((option, idx) => (
              <div
                key={option.id}
                className={`relative flex flex-col gap-2 rounded-2xl border border-orange-200 bg-white px-3 py-3 dark:border-orange-900/40 dark:bg-zinc-900${options.length === 3 ? " min-w-[130px] shrink-0 sm:min-w-0 sm:shrink" : ""}`}
              >
                {/* Fake bet overlay */}
                <FakeBetOverlay optionIndex={idx} bets={fakeBets} />

                <div className="flex items-center justify-between gap-2">
                  {option.logoSrc ? (
                    <img
                      src={option.logoSrc}
                      alt={option.label}
                      className="size-5 shrink-0 rounded-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="size-5 shrink-0" />
                  )}
                  <span className="shrink-0 text-sm font-bold text-zinc-950 dark:text-zinc-50">
                    x{option.oddsMultiplier}
                  </span>
                </div>
                <span className="line-clamp-2 text-xs font-semibold leading-tight text-zinc-800 dark:text-zinc-200">
                  {option.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Volume */}
        {vol && (vol.usdc > 0 || vol.clt > 0) && (
          <div className="flex items-center justify-between gap-2 border-t border-orange-100 pt-3 text-xs font-medium text-zinc-500 dark:border-orange-900/30 dark:text-zinc-400">
            {vol.usdc > 0 && (
              <span>VOL: {vol.usdc.toLocaleString("en-US", { maximumFractionDigits: 0 })} USDC</span>
            )}
            {vol.clt > 0 && (
              <span>VOL: {vol.clt.toLocaleString("en-US", { maximumFractionDigits: 0 })} ClawdTrust</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

function MarketVisual({ market }: { market: PredictionMarketRow }) {
  if (market.visual_type === "vs") {
    return (
      <div className="flex items-center gap-2">
        <CompetitorAvatar name={market.left_competitor_name} src={market.left_competitor_image_src} />
        <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500">VS</span>
        <CompetitorAvatar name={market.right_competitor_name} src={market.right_competitor_image_src} />
      </div>
    );
  }
  if (market.visual_type === "simple" && market.single_name) {
    return (
      <div className="flex items-center gap-2">
        {market.single_image_src && (
          <img src={market.single_image_src} alt={market.single_name} className="size-6 rounded-full object-cover" loading="lazy" />
        )}
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{market.single_name}</span>
      </div>
    );
  }
  return null;
}

function CompetitorAvatar({ name, src }: { name: string | null; src: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      {src ? (
        <img src={src} alt={name ?? ""} className="size-6 rounded-full object-cover" loading="lazy" />
      ) : (
        <div className="flex size-6 items-center justify-center rounded-full bg-orange-200 text-xs font-bold text-orange-700 dark:bg-orange-900/50 dark:text-orange-300">
          {name?.[0] ?? "?"}
        </div>
      )}
      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{name}</span>
    </div>
  );
}
