"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Trophy, Flame } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { PmMarket } from "@/lib/polymarket";

const _cache = new Map<string, { at: number; markets: PmMarket[] }>();

function fmtVol(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}


export function PmCard({ m, className = "" }: { m: PmMarket; className?: string }) {
  const { tr } = useT();
  return (
          <a
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`group block rounded-2xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40 ${className}`}
          >
            <div className="flex items-start gap-3">
              {m.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt="" loading="lazy" className="size-10 shrink-0 rounded-xl bg-muted object-cover" />
              ) : (
                <div className="size-10 shrink-0 rounded-xl bg-muted" />
              )}
              <p className="line-clamp-2 flex-1 text-[13px] font-semibold leading-snug text-foreground">{m.title}</p>
              <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              {m.outcomes.map((o) => (
                <div key={o.label} className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs">
                  <span className="truncate font-medium text-foreground">{o.label}</span>
                  <span className="shrink-0 font-bold tabular-nums text-primary">{o.pct}%</span>
                </div>
              ))}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{tr("24h vol")} {fmtVol(m.volume24h)}</span>
              {m.live && <span className="font-semibold text-down">LIVE</span>}
            </div>
          </a>
  );
}

/** Colonne Polymarket : marchés externes en lecture seule, séparés des marchés ŌM. */
export function PolymarketColumn({ className = "" }: { className?: string }) {
  const { tr } = useT();
  const [kind, setKind] = useState<"trending" | "sports">("trending");
  const [markets, setMarkets] = useState<PmMarket[] | null>(_cache.get("trending")?.markets ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const hit = _cache.get(kind);
    if (hit && Date.now() - hit.at < 60_000) { setMarkets(hit.markets); setFailed(false); return; }
    setMarkets(null); setFailed(false);
    fetch(`/api/polymarket?kind=${kind}`)
      .then((r) => r.json())
      .then((d: { markets?: PmMarket[]; error?: boolean }) => {
        if (!alive) return;
        const m = d.markets ?? [];
        if (d.error && m.length === 0) { setFailed(true); setMarkets([]); return; }
        _cache.set(kind, { at: Date.now(), markets: m });
        setMarkets(m);
      })
      .catch(() => { if (alive) { setFailed(true); setMarkets([]); } });
    return () => { alive = false; };
  }, [kind]);

  const chip = (id: "trending" | "sports", label: string, Icon: typeof Flame) => (
    <button
      type="button"
      onClick={() => setKind(id)}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${kind === id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}
    >
      <Icon className="size-3.5" />{label}
    </button>
  );

  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href="/polymarket" className="text-lg font-bold tracking-tight text-foreground hover:text-primary">Polymarket <span className="text-muted-foreground">›</span></Link>
        <div className="flex gap-1.5">
          {chip("trending", tr("Trending"), Flame)}
          {chip("sports", tr("Sports"), Trophy)}
        </div>
      </div>

      {markets === null && (
        <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      )}
      {markets !== null && markets.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {failed ? tr("Couldn't load Polymarket markets.") : tr("No Polymarket markets right now.")}
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {(markets ?? []).map((m) => <PmCard key={m.id} m={m} />)}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
        {tr("Data from Polymarket. Bets are placed on polymarket.com.")}
      </p>
    </section>
  );
}
