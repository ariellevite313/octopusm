"use client";

import { useState, useEffect } from "react";
import { useAutoMarquee } from "@/hooks/use-auto-marquee";
import { TrendingCard } from "./trending-card";
import { MiniCard } from "./featured";
import { useFeatured } from "./featured-home";
import { useT } from "@/lib/i18n";
import type { TrendingMarket } from "@/app/api/markets/trending/route";
import { Flame } from "lucide-react";

export function TrendingSection() {
  const { tr } = useT();
  const [markets, setMarkets] = useState<TrendingMarket[] | null>(null);
  const feat = useFeatured();
  const extra = feat?.featured ?? [];

  useEffect(() => {
    fetch("/api/markets/trending")
      .then((r) => r.json())
      .then((data: unknown) => {
        setMarkets(Array.isArray(data) ? (data as TrendingMarket[]) : []);
      })
      .catch(() => setMarkets([]));
  }, []);

  // Défilement automatique continu (liste dupliquée → boucle sans à-coup), pause au toucher / survol.
  const total = (markets?.length ?? 0) + extra.length;
  const loopable = total > 2;
  const scroller = useAutoMarquee(total, loopable);

  // Don't render until loaded (null = loading) — avoids layout shift
  if (markets === null && !feat) return null;
  if (total === 0) return null;

  return (
    <section className="mt-6 mb-8">
      <h2 className="mb-3 flex items-center gap-1.5 text-lg font-bold tracking-tight text-foreground">
        <Flame className="size-5 fill-foreground text-foreground" />{tr("Trending")}
      </h2>
      <div
        ref={scroller}
        className={`flex gap-3 overflow-x-auto pb-1 ${loopable ? "" : "snap-x snap-mandatory"}`}
        style={{ scrollbarWidth: "none" }}
      >
        {(markets ?? []).map((m) => <TrendingCard key={m.id} market={m} />)}
        {extra.map((e) => <MiniCard key={e.id} e={e} usMap={feat?.usMap ?? {}} />)}
        {loopable && (markets ?? []).map((m) => <TrendingCard key={`dup-${m.id}`} market={m} />)}
        {loopable && extra.map((e) => <MiniCard key={`dup-${e.id}`} e={e} usMap={feat?.usMap ?? {}} />)}
        {/* Spacer so last card isn't cut off on mobile */}
        <div className="w-1 shrink-0" aria-hidden />
      </div>
    </section>
  );
}
