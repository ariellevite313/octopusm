"use client";

import { useState } from "react";
import { MarketCard } from "./market-card";
import type { PredictionMarketRow } from "@/lib/supabase/types";
import type { MarketVolumes } from "@/lib/market/utils";

function getCategories(markets: PredictionMarketRow[]): string[] {
  const seen = new Set<string>();
  const cats: string[] = [];
  for (const m of markets) {
    if (m.category_id && !seen.has(m.category_id)) {
      seen.add(m.category_id);
      cats.push(m.category_id);
    }
  }
  return cats;
}

function fmt(cat: string) {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

type Props = {
  markets: PredictionMarketRow[];
  volumes: MarketVolumes;
};

export function MarketGrid({ markets, volumes }: Props) {
  const [active, setActive] = useState<string>("all");
  const categories = getCategories(markets);
  const filtered = active === "all" ? markets : markets.filter((m) => m.category_id === active);

  return (
    <div className="space-y-6">
      {/* Category tabs */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActive("all")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              active === "all"
                ? "bg-orange-500 text-white"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({markets.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActive(cat)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
                active === cat
                  ? "bg-orange-500 text-white"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {fmt(cat)} ({markets.filter((m) => m.category_id === cat).length})
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span className="text-4xl">🐙</span>
          <p className="text-muted-foreground">No markets in this category.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((market) => (
            <MarketCard key={market.id} market={market} volumes={volumes} />
          ))}
        </div>
      )}
    </div>
  );
}
