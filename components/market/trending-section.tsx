"use client";

import { useState, useEffect, useRef } from "react";
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

  // Défilement automatique continu (liste dupliquée → boucle sans à-coup).
  // Pause au toucher / survol ; le glissé manuel reste possible.
  const scroller = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const loopable = !!markets && markets.length > 2;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !loopable) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, pos = el.scrollLeft, last = performance.now(), resume: ReturnType<typeof setTimeout> | undefined;
    const SPEED = 38; // px / seconde
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64); last = now;
      const dup = el.children[markets!.length] as HTMLElement | undefined;
      const half = dup ? dup.offsetLeft - (el.children[0] as HTMLElement).offsetLeft : 0;
      if (!paused.current && half > el.clientWidth) {
        pos += (SPEED * dt) / 1000;
        if (pos >= half) pos -= half;
        el.scrollLeft = pos;
      } else {
        pos = el.scrollLeft;
      }
      raf = requestAnimationFrame(tick);
    };
    const hold = () => { paused.current = true; if (resume) clearTimeout(resume); };
    const release = () => { if (resume) clearTimeout(resume); resume = setTimeout(() => { paused.current = false; }, 1800); };
    el.addEventListener("pointerdown", hold);
    el.addEventListener("pointerenter", hold);
    el.addEventListener("pointerleave", release);
    el.addEventListener("pointerup", release);
    el.addEventListener("touchend", release);
    el.addEventListener("wheel", () => { hold(); release(); }, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf); if (resume) clearTimeout(resume);
      el.removeEventListener("pointerdown", hold); el.removeEventListener("pointerenter", hold);
      el.removeEventListener("pointerleave", release); el.removeEventListener("pointerup", release);
      el.removeEventListener("touchend", release);
    };
  }, [loopable]);

  // Don't render until loaded (null = loading) — avoids layout shift
  if (!markets || markets.length === 0) return null;

  return (
    <section className="mt-6 mb-8">
      <h2 className="mb-3 flex items-center gap-1.5 text-lg font-bold tracking-tight text-foreground">
        <Flame className="size-5 fill-orange-500 text-orange-500" />{tr("Trending")}
      </h2>
      <div
        ref={scroller}
        className={`flex gap-3 overflow-x-auto pb-1 ${loopable ? "" : "snap-x snap-mandatory"}`}
        style={{ scrollbarWidth: "none" }}
      >
        {markets.map((m) => (
          <TrendingCard key={m.id} market={m} />
        ))}
        {loopable && markets.map((m) => (
          <TrendingCard key={`dup-${m.id}`} market={m} />
        ))}
        {/* Spacer so last card isn't cut off on mobile */}
        <div className="w-1 shrink-0" aria-hidden />
      </div>
    </section>
  );
}
