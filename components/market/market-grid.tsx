"use client";

import { MarketCard } from "./market-card";
import { PoolGridCard } from "./pool-grid-card";
import type { UnifiedMarket, PredictionMarketRow, MutuelMarketRow } from "@/lib/supabase/types";
import type { MarketVolumes } from "@/lib/market/utils";

type Props = {
  markets: UnifiedMarket[];
  volumes: MarketVolumes;
  showCategoryTabs?: boolean;
};

export function MarketGrid({ markets, volumes }: Props) {
  const isLiveMarket = (m: UnifiedMarket) =>
    m.source === "prediction" &&
    !!m.event_start_at &&
    Date.now() >= new Date(m.event_start_at).getTime();

  const sorted = [...markets].sort((a, b) => Number(isLiveMarket(b)) - Number(isLiveMarket(a)));

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <span className="text-5xl">🐙</span>
        <p className="text-muted-foreground">No active markets right now.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((m) =>
        m.source === "pool"
          ? <PoolGridCard key={m.id} market={m as MutuelMarketRow} />
          : <MarketCard   key={m.id} market={m as PredictionMarketRow} volumes={volumes} />
      )}
    </div>
  );
}
