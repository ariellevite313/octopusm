"use client";

import { useState, useEffect } from "react";
import { TrendingCard } from "./trending-card";
import { useT } from "@/lib/i18n";
import type { TrendingMarket } from "@/app/api/markets/trending/route";
import { Flame } from "lucide-react";

export function TrendingSection() {
  const { tr } = useT();
  const [markets, setMarkets] = useState<TrendingMarket[] | null>(null);

  useEffect(() => {
    fetch("/api/markets/trending")
      .then((r) => r.json())
      .then((data: unknown) => {
        setMarkets(Array.isArray(data) ? (data as TrendingMarket[]) : []);
      })
      .catch(() => setMarkets([]));
  }, []);

  // Don't render until loaded (null = loading) — avoids layout shift
  if (!markets || markets.length === 0) return null;

  return (
    <section className="mt-6 mb-8">
      <h2 className="mb-3 flex items-center gap-1.5 text-lg font-bold tracking-tight text-foreground">
        <Flame className="size-5 fill-orange-500 text-orange-500" />{tr("Trending")}
      </h2>
      <div
        className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory"
        style={{ scrollbarWidth: "none" }}
      >
        {markets.map((m) => (
          <TrendingCard key={m.id} market={m} />
        ))}
        {/* Spacer so last card isn't cut off on mobile */}
        <div className="w-1 shrink-0" aria-hidden />
      </div>
    </section>
  );
}
