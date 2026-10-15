"use client";

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
export function MiniCard({ e, usMap }: { e: PmEvent; usMap: Record<string, PmStateLean> }) {
  const { tr } = useT();
  const hasMap = Object.keys(usMap).length > 0 && isMid(e);
  return (
    <a
      href={e.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-[13.5rem] w-[264px] shrink-0 flex-col rounded-[22px] border border-border bg-card p-3.5 transition-colors hover:border-primary/40"
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
