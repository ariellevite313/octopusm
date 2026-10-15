"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Flame, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { PmCard } from "@/components/market/polymarket-column";
import { UsDotMap } from "@/components/market/us-dot-map";
import type { PmEvent, PmStateLean, PmTag, PmTopic } from "@/lib/polymarket";

type Home = { featured: PmEvent[]; topics: PmTopic[]; categories: PmTag[]; markets: PmEvent[]; usMap?: Record<string, PmStateLean>; error?: boolean };

function fmtVol(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

export function Featured({ events, usMap, neutral = false }: { events: PmEvent[]; usMap: Record<string, PmStateLean>; neutral?: boolean }) {
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

  const e = events[i];
  if (!e) return null;
  const hasMap = Object.keys(usMap).length > 0 && /midterm|\bsenate\b|congress|\bu\.?s\.? (house|election)/i.test(`${e.title} ${e.category ?? ""} ${e.tags.map((t) => t.slug).join(" ")}`);
  return (
    <div
      className="rounded-3xl border border-border bg-card p-5 md:p-6"
      onPointerEnter={() => { hold.current = true; }}
      onPointerLeave={() => { hold.current = false; }}
    >
      <div className="flex items-start gap-3">
        {e.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.image} alt="" className="size-12 shrink-0 rounded-xl bg-muted object-cover" />
        ) : <div className="size-12 shrink-0 rounded-xl bg-muted" />}
        <div className="min-w-0 flex-1">
          {e.category && <p className="text-xs font-medium text-muted-foreground">{e.category}</p>}
          <h2 className="text-lg font-bold leading-snug tracking-tight text-foreground md:text-2xl">{e.title}</h2>
        </div>
        <a href={e.url} target="_blank" rel="noopener noreferrer" aria-label={neutral ? tr("View market") : tr("Open on Polymarket")} className="mt-1 text-muted-foreground hover:text-foreground">
          <ExternalLink className="size-4" />
        </a>
      </div>

      <div className={hasMap ? "mt-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-6" : "mt-4"}>
      <div className="divide-y divide-border/60">
        {e.items.slice(0, 6).map((o) => (
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
          <UsDotMap leans={usMap} className="mx-auto w-full max-w-md" />
          <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-500" />{tr("Democrats")}</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-red-500" />{tr("Republicans")}</span>
          </div>
        </div>
      )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{tr("24h vol")} {fmtVol(e.volume24h)}{e.live ? " · " : ""}{e.live && <span className="font-semibold text-down">LIVE</span>}</span>
        <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:text-primary">
          {neutral ? tr("View market") : tr("Open on Polymarket")} →
        </a>
      </div>

      {n > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {events.map((_, k) => (
              <button key={k} type="button" aria-label={`${k + 1}`} onClick={() => setI(k)}
                className={`h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-foreground" : "w-1.5 bg-muted-foreground/40"}`} />
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

export function PolymarketHome() {
  const { tr } = useT();
  const [tag, setTag] = useState<string>("");
  const [data, setData] = useState<Home | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const base = useRef<Home | null>(null);

  useEffect(() => {
    let alive = true;
    if (tag === "" && base.current) { setData(base.current); return; }
    setGridLoading(true);
    fetch(`/api/polymarket/home${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`)
      .then((r) => r.json())
      .then((d: Home) => {
        if (!alive) return;
        if (tag === "") base.current = d;
        setData((prev) => (tag && prev ? { ...prev, markets: d.markets } : d));
      })
      .catch(() => { if (alive && !data) setData({ featured: [], topics: [], categories: [], markets: [], usMap: {}, error: true }); })
      .finally(() => { if (alive) setGridLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  if (!data) return <div className="flex justify-center py-32 text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div>;

  const empty = data.featured.length === 0 && data.markets.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-32 pt-5 md:px-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/prediction" className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />{tr("Markets")}
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Polymarket</h1>
      </div>

      {empty ? (
        <p className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          {tr("Couldn't load Polymarket markets.")}
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Featured events={data.featured} usMap={data.usMap ?? {}} />

            <aside className="rounded-3xl border border-border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-1.5 text-[15px] font-bold text-foreground">
                <Flame className="size-4 fill-orange-500 text-orange-500" />{tr("Trending topics")}
              </h2>
              <ol>
                {data.topics.map((t, k) => (
                  <li key={t.slug}>
                    <button type="button" onClick={() => setTag(t.slug)} className="flex w-full items-center gap-3 border-b border-border/60 py-2.5 text-left last:border-0 hover:text-primary">
                      <span className="num w-4 text-[13px] text-muted-foreground">{k + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">{t.label}</span>
                      <span className="num shrink-0 text-xs text-muted-foreground">{fmtVol(t.volume)} {tr("today")}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ol>
              <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="mt-3 flex h-10 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-foreground hover:bg-muted/70">
                {tr("Explore all on Polymarket")}
              </a>
            </aside>
          </div>

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-bold tracking-tight text-foreground">{tr("All markets")}</h2>
            <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
              <button type="button" onClick={() => setTag("")}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${tag === "" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                {tr("All")}
              </button>
              {data.categories.map((c) => (
                <button key={c.slug} type="button" onClick={() => setTag(c.slug)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${tag === c.slug ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                  {c.label}
                </button>
              ))}
            </div>
            {gridLoading ? (
              <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
            ) : data.markets.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{tr("No Polymarket markets right now.")}</p>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {data.markets.map((m) => <PmCard key={m.id} m={m} />)}
              </div>
            )}
          </section>
          <p className="mt-6 text-[11px] text-muted-foreground/70">{tr("Data from Polymarket. Bets are placed on polymarket.com.")}</p>
        </>
      )}
    </div>
  );
}
