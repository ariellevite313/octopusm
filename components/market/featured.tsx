"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { UsDotMap } from "@/components/market/us-dot-map";
import type { PmEvent, PmStateLean } from "@/lib/polymarket";

function fmtVol(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

const isMid = (e: PmEvent) => /midterm|\bsenate\b|congress|\bu\.?s\.? (house|election)/i.test(`${e.title} ${e.category ?? ""} ${e.tags.map((t) => t.slug).join(" ")}`);

/** Petite carte de taille fixe (même mesure pour toutes). */
function MiniCard({ e, usMap }: { e: PmEvent; usMap: Record<string, PmStateLean> }) {
  const { tr } = useT();
  const hasMap = Object.keys(usMap).length > 0 && isMid(e);
  return (
    <a
      href={e.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-[13.5rem] w-[19rem] shrink-0 flex-col rounded-2xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start gap-2.5">
        {e.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.image} alt="" loading="lazy" className="size-9 shrink-0 rounded-lg bg-muted object-cover" />
        ) : <div className="size-9 shrink-0 rounded-lg bg-muted" />}
        <div className="min-w-0 flex-1">
          {e.category && <p className="truncate text-[11px] font-medium text-muted-foreground">{e.category}</p>}
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">{e.title}</p>
        </div>
      </div>

      <div className="mt-2.5 flex min-h-0 flex-1 items-center gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {e.items.slice(0, 3).map((o) => (
            <div key={o.label} className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1 text-xs">
              <span className="truncate font-medium text-foreground">{o.label}</span>
              <span className="num shrink-0 font-bold text-primary">{o.pct}%</span>
            </div>
          ))}
        </div>
        {hasMap && <UsDotMap leans={usMap} className="w-24 shrink-0" />}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{tr("24h vol")} {fmtVol(e.volume24h)}{e.live && <span className="ml-1.5 font-semibold text-down">LIVE</span>}</span>
        <span className="font-semibold text-foreground">{tr("View market")} →</span>
      </div>
    </a>
  );
}

/** Bande de petites cartes qui défile en continu (pause au toucher/survol, glissé manuel possible). */
export function FeaturedStrip({ events, usMap }: { events: PmEvent[]; usMap: Record<string, PmStateLean> }) {
  const scroller = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const n = events.length;

  useEffect(() => {
    const el = scroller.current;
    if (!el || n < 3) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, pos = el.scrollLeft, last = performance.now(), resume: ReturnType<typeof setTimeout> | undefined;
    const SPEED = 34;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64); last = now;
      const dup = el.children[n] as HTMLElement | undefined;
      const half = dup ? dup.offsetLeft - (el.children[0] as HTMLElement).offsetLeft : 0;
      if (!paused.current && half > el.clientWidth) {
        pos += (SPEED * dt) / 1000;
        if (pos >= half) pos -= half;
        el.scrollLeft = pos;
      } else pos = el.scrollLeft;
      raf = requestAnimationFrame(tick);
    };
    const hold = () => { paused.current = true; if (resume) clearTimeout(resume); };
    const release = () => { if (resume) clearTimeout(resume); resume = setTimeout(() => { paused.current = false; }, 1800); };
    const wheel = () => { hold(); release(); };
    el.addEventListener("pointerdown", hold); el.addEventListener("pointerenter", hold);
    el.addEventListener("pointerleave", release); el.addEventListener("pointerup", release);
    el.addEventListener("touchend", release); el.addEventListener("wheel", wheel, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf); if (resume) clearTimeout(resume);
      el.removeEventListener("pointerdown", hold); el.removeEventListener("pointerenter", hold);
      el.removeEventListener("pointerleave", release); el.removeEventListener("pointerup", release);
      el.removeEventListener("touchend", release); el.removeEventListener("wheel", wheel);
    };
  }, [n]);

  if (n === 0) return null;
  const loop = n >= 3;
  return (
    <div ref={scroller} className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {events.map((e) => <MiniCard key={e.id} e={e} usMap={usMap} />)}
      {loop && events.map((e) => <MiniCard key={`dup-${e.id}`} e={e} usMap={usMap} />)}
    </div>
  );
}
