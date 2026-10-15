"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n";
import { UsDotMap } from "@/components/market/us-dot-map";
import type { PmEvent, PmStateLean } from "@/lib/polymarket";

function fmtVol(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function Slide({ e, usMap }: { e: PmEvent; usMap: Record<string, PmStateLean> }) {
  const { tr } = useT();
  const hasMap = Object.keys(usMap).length > 0 && /midterm|\bsenate\b|congress|\bu\.?s\.? (house|election)/i.test(`${e.title} ${e.category ?? ""} ${e.tags.map((t) => t.slug).join(" ")}`);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3">
        {e.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.image} alt="" className="size-12 shrink-0 rounded-xl bg-muted object-cover" />
        ) : <div className="size-12 shrink-0 rounded-xl bg-muted" />}
        <div className="min-w-0 flex-1">
          {e.category && <p className="text-xs font-medium text-muted-foreground">{e.category}</p>}
          <h2 className="line-clamp-2 text-lg font-bold leading-snug tracking-tight text-foreground md:text-2xl">{e.title}</h2>
        </div>
        <a href={e.url} target="_blank" rel="noopener noreferrer" aria-label={tr("View market")} className="mt-1 text-muted-foreground hover:text-foreground">
          <ExternalLink className="size-4" />
        </a>
      </div>

      <div className={hasMap ? "mt-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-6" : "mt-4"}>
      <div className="divide-y divide-border/60">
        {e.items.slice(0, hasMap ? 3 : 5).map((o) => (
          <div key={o.label} className="flex items-center gap-3 py-2.5">
            {o.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.image} alt="" loading="lazy" className="size-8 shrink-0 rounded-full bg-muted object-cover" />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">{o.label}</span>
            <span className="w-24 shrink-0 overflow-hidden rounded-full bg-muted">
              <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, o.pct)}%` }} />
            </span>
            <span className="num w-10 shrink-0 text-right text-[15px] font-bold text-foreground">{o.pct}%</span>
          </div>
        ))}
      </div>
      {hasMap && (
        <div className="mt-4 md:mt-0">
          <UsDotMap leans={usMap} className="mx-auto w-full max-w-[15rem] md:max-w-[17rem]" />
          <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-500" />{tr("Democrats")}</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-red-500" />{tr("Republicans")}</span>
          </div>
        </div>
      )}
      </div>

      <div className="mt-auto flex items-center justify-between pt-3 text-xs text-muted-foreground">
        <span>{tr("24h vol")} {fmtVol(e.volume24h)}{e.live ? " · " : ""}{e.live && <span className="font-semibold text-down">LIVE</span>}</span>
        <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:text-primary">
          {tr("View market")} →
        </a>
      </div>

    </div>
  );
}

export function Featured({ events, usMap }: { events: PmEvent[]; usMap: Record<string, PmStateLean> }) {
  const { tr } = useT();
  const [i, setI] = useState(0);
  const hold = useRef(false);
  const n = events.length;
  const go = useCallback((d: number) => setI((v) => (v + d + n) % n), [n]);

  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => { if (!hold.current) setI((v) => (v + 1) % n); }, 6000);
    return () => clearInterval(t);
  }, [n]);

  const cur = Math.min(i, n - 1);
  if (n === 0) return null;
  return (
    <div
      className="flex h-[32rem] flex-col rounded-3xl border border-border bg-card p-5 md:h-[27rem] md:p-6"
      onPointerEnter={() => { hold.current = true; }}
      onPointerLeave={() => { hold.current = false; }}
    >
      {/* Toutes les slides sont empilées dans la même cellule : la hauteur = la plus grande, donc rien ne bouge au changement */}
      <div className="grid min-h-0 flex-1 overflow-hidden">
        {events.map((e, k) => (
          <div
            key={e.id}
            aria-hidden={k !== cur}
            className={`[grid-area:1/1] transition-opacity duration-300 ${k === cur ? "opacity-100" : "pointer-events-none invisible opacity-0"}`}
          >
            <Slide e={e} usMap={usMap} />
          </div>
        ))}
      </div>

      {n > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {events.map((_, k) => (
              <button key={k} type="button" aria-label={`${k + 1}`} onClick={() => setI(k)}
                className={`h-1.5 rounded-full transition-all ${k === cur ? "w-6 bg-foreground" : "w-1.5 bg-muted-foreground/40"}`} />
            ))}
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => go(-1)} aria-label="Previous" className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next" className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"><ChevronRight className="size-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
