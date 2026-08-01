"use client";

import { useState } from "react";
import { MarketCard } from "./market-card";
import { PoolGridCard } from "./pool-grid-card";
import { UpDownSection } from "@/components/updown/updown-cards";
import type { UnifiedMarket, PredictionMarketRow, MutuelMarketRow } from "@/lib/supabase/types";
import type { MarketVolumes } from "@/lib/market/utils";

type Props = {
  markets: UnifiedMarket[];
  volumes: MarketVolumes;
  showCategoryTabs?: boolean;
};

/** Catégorie normalisée — prediction utilise category_id, pool utilise category */
function getCategory(m: UnifiedMarket): string {
  return m.source === "prediction" ? m.category_id : m.category;
}

export function MarketGrid({ markets, volumes, showCategoryTabs = true }: Props) {
  const [cryptoSub, setCryptoSub] = useState<"updown" | "hitprice">("updown");

  const isLiveMarket = (m: UnifiedMarket) =>
    m.source === "prediction" &&
    !!m.event_start_at &&
    Date.now() >= new Date(m.event_start_at).getTime();

  const sortLiveFirst = (list: UnifiedMarket[]) =>
    [...list].sort((a, b) => Number(isLiveMarket(b)) - Number(isLiveMarket(a)));

  // Crypto page : tous les marchés sont dans la catégorie "crypto"
  const isCryptoPage = !showCategoryTabs && markets.every((m) => getCategory(m) === "crypto");
  const cryptoMarkets = sortLiveFirst(markets.filter((m) => getCategory(m) === "crypto"));
  const sorted = sortLiveFirst(markets);

  if (isCryptoPage) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2 rounded-2xl border border-border bg-muted/30 p-1 w-fit">
          <button
            type="button"
            onClick={() => setCryptoSub("updown")}
            className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition-colors ${cryptoSub === "updown" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Up/Down
          </button>
          <button
            type="button"
            onClick={() => setCryptoSub("hitprice")}
            className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition-colors ${cryptoSub === "hitprice" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Event
          </button>
        </div>

        {cryptoSub === "updown" ? (
          <UpDownSection />
        ) : cryptoMarkets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="text-4xl">🐙</span>
            <p className="text-muted-foreground">No Event markets active.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cryptoMarkets.map((m) =>
              m.source === "pool"
                ? <PoolGridCard key={m.id} market={m as MutuelMarketRow} />
                : <MarketCard   key={m.id} market={m as PredictionMarketRow} volumes={volumes} />
            )}
          </div>
        )}
      </div>
    );
  }

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
