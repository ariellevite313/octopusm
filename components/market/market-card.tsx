"use client";

import Link from "next/link";
import { MarketCountdownBadge } from "./market-countdown";
import { useFakeLiveBets, FakeBetOverlay } from "./market-fake-bets";
import { parseMarketOptions, formatVolume, type MarketVolumes } from "@/lib/market/utils";
import type { PredictionMarketRow } from "@/lib/supabase/types";

type Props = {
  market: PredictionMarketRow;
  volumes?: MarketVolumes;
};

export function MarketCard({ market, volumes }: Props) {
  const options = parseMarketOptions(market.options);
  const vol = volumes?.[market.id];
  const hasVolume = !!vol && (vol.usdc > 0 || vol.clt > 0);
  const fakeBets = useFakeLiveBets(options.length, !hasVolume);
  const href = `/prediction/${market.slug ?? market.id}`;

  return (
    <Link href={href} className="group flex h-full flex-col overflow-hidden rounded-[22px] border border-border bg-card transition-colors hover:border-primary/40">
      <div className="flex flex-1 flex-col gap-4 p-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[16px] font-bold leading-snug tracking-tight text-foreground">
              {market.title}
            </p>
            <div className="mt-2">
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
                className={`relative flex flex-col gap-2.5 rounded-2xl border border-transparent bg-muted/70 px-3.5 py-3 transition-colors group-hover:bg-muted${options.length === 3 ? " min-w-[130px] shrink-0 sm:min-w-0 sm:shrink" : ""}`}
              >
                {/* Fake bet overlay */}
                <FakeBetOverlay optionIndex={idx} bets={fakeBets} optionCount={options.length} />

                <div className="flex items-center justify-between gap-2">
                  {option.logoSrc ? (
                    <img
                      src={option.logoSrc}
                      alt={option.label}
                      className="size-6 shrink-0 rounded-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="size-6 shrink-0" />
                  )}
                  <span className="num shrink-0 rounded-lg bg-muted px-2 py-0.5 text-[15px] font-bold text-foreground">
                    x{option.oddsMultiplier}
                  </span>
                </div>
                <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-foreground">
                  {option.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Volume */}
        {vol && (vol.usdc > 0 || vol.clt > 0) && (
          <div className="mt-auto flex items-center gap-3 border-t border-border pt-3 text-[13px] font-semibold text-muted-foreground num">
            {vol.usdc > 0 && <span>{formatVolume(vol.usdc, "usdc")}</span>}
            {vol.clt > 0  && <span>{formatVolume(vol.clt, "clawdtrust")}</span>}
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
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">VS</span>
        <CompetitorAvatar name={market.right_competitor_name} src={market.right_competitor_image_src} />
      </div>
    );
  }
  if (market.visual_type === "simple" && market.single_name) {
    return (
      <div className="flex items-center gap-2">
        {market.single_image_src && (
          <img src={market.single_image_src} alt={market.single_name} className="size-7 rounded-full object-cover" loading="lazy" />
        )}
        <span className="text-sm font-semibold text-foreground">{market.single_name}</span>
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
        <div className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
          {name?.[0] ?? "?"}
        </div>
      )}
      <span className="text-[13px] font-semibold text-muted-foreground">{name}</span>
    </div>
  );
}
