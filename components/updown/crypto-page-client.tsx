"use client";

import { useState } from "react";
import { UpDownSection } from "./updown-cards";
import { MarketCard } from "@/components/market/market-card";
import type { PredictionMarketRow } from "@/lib/supabase/types";
import type { MarketVolumes } from "@/lib/market/utils";

type Tab = "updown" | "hitprice";

type Props = {
  hitPriceMarkets: PredictionMarketRow[];
  volumes: MarketVolumes;
};

export function CryptoPageClient({ hitPriceMarkets, volumes }: Props) {
  const [tab, setTab] = useState<Tab>("updown");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex gap-2 rounded-2xl border border-border bg-muted/30 p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("updown")}
          className={[
            "rounded-xl px-5 py-2 text-sm font-semibold transition-colors",
            tab === "updown"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          Up / Down
        </button>
        <button
          type="button"
          onClick={() => setTab("hitprice")}
          className={[
            "rounded-xl px-5 py-2 text-sm font-semibold transition-colors",
            tab === "hitprice"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          Hit Price
        </button>
      </div>

      {tab === "updown" && <UpDownSection />}

      {tab === "hitprice" && (
        hitPriceMarkets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="text-5xl">🎯</span>
            <p className="text-muted-foreground">No active Hit Price markets at the moment.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hitPriceMarkets.map((m) => (
              <MarketCard key={m.id} market={m} volumes={volumes} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
