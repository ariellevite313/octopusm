"use client";

import { useState } from "react";
import { MarketCard } from "./market-card";
import { UpDownSection } from "@/components/updown/updown-cards";
import type { PredictionMarketRow } from "@/lib/supabase/types";
import type { MarketVolumes } from "@/lib/market/utils";

type Props = {
  markets: PredictionMarketRow[];
  volumes: MarketVolumes;
  showCategoryTabs?: boolean;
};

export function MarketGrid({ markets, volumes, showCategoryTabs = true }: Props) {
  const [cryptoSub, setCryptoSub] = useState<"updown" | "hitprice">("updown");

  const isLiveMarket = (m: PredictionMarketRow) =>
    !!m.event_start_at && Date.now() >= new Date(m.event_start_at).getTime();
  const sortLiveFirst = (list: PredictionMarketRow[]) =>
    [...list].sort((a, b) => Number(isLiveMarket(b)) - Number(isLiveMarket(a)));

  const isCryptoPage = !showCategoryTabs && markets.every((m) => m.category_id === "crypto");
  const hitPriceMarkets = sortLiveFirst(markets.filter((m) => m.category_id === "crypto"));
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
            Hit Price
          </button>
        </div>

        {cryptoSub === "updown" ? (
          <UpDownSection />
        ) : hitPriceMarkets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="text-4xl">🐙</span>
            <p className="text-muted-foreground">No Hit Price markets active.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hitPriceMarkets.map((m) => <MarketCard key={m.id} market={m} volumes={volumes} />)}
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
      {sorted.map((market) => (
        <MarketCard key={market.id} market={market} volumes={volumes} />
      ))}
    </div>
  );
}
