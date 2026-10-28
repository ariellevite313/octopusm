"use client";

import { useEffect, useRef, useState } from "react";
import { Chart } from "./token-card";
import { fmtUsd, loadSeries, resolveQuote, subscribePrice, type LiveQuote, type Range } from "@/lib/social/live-price";

const RANGES: Range[] = ["1H", "1D", "1W", "ALL"];

/**
 * Prix en temps réel d'une crypto (logo, nom, prix, variation 24 h, graphique).
 * `target` : objectif de prix d'un marché de prédiction (affiche l'écart restant).
 * `anyDex` : pour un marché créé par un admin sur un token précis ; les cashtags des posts restent limités aux symboles connus.
 */
export function LivePrice({ symbol, target, targetLabel, anyDex = false }: { symbol: string; target?: number | null; targetLabel?: string; anyDex?: boolean }) {
  const [q, setQ] = useState<LiveQuote | null | undefined>(undefined);
  const [price, setPrice] = useState(0);
  const [change, setChange] = useState(0);
  const [range, setRange] = useState<Range>("1D");
  const [pts, setPts] = useState<number[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Ne charge et ne s'abonne que lorsque la carte est à l'écran
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    resolveQuote(symbol, { anyDex }).then((r) => { if (!live) return; setQ(r); if (r) { setPrice(r.price); setChange(r.change24h); } });
    return () => { live = false; };
  }, [symbol, anyDex]);

  useEffect(() => {
    if (!q || !visible) return;
    return subscribePrice(q, (p, c) => { setPrice(p); setChange(c); });
  }, [q, visible]);

  useEffect(() => {
    if (!q) return;
    let live = true;
    loadSeries(q, range).then((s) => live && setPts(s));
    return () => { live = false; };
  }, [q, range]);

  if (q === null) return null;
  if (q === undefined) return <div ref={root} className="mt-3 h-32 animate-pulse rounded-2xl bg-muted/30" />;

  const up = change >= 0;
  const series = pts.length >= 2 ? [...pts.slice(0, -1), price || pts[pts.length - 1]] : pts;
  const gap = target && price ? ((target - price) / price) * 100 : null;

  return (
    <div ref={root} className="mt-3">
      <div className="flex items-center gap-3">
        {q.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.logo} alt="" className="size-9 shrink-0 rounded-full bg-muted object-cover" />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">{q.symbol[0]}</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-foreground">{q.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-up" />
            </span>
            {q.symbol}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-[17px] font-bold text-foreground">{fmtUsd(price)}</p>
          <p className={`num text-xs font-bold ${up ? "text-up" : "text-down"}`}>{up ? "+" : ""}{change.toFixed(2)}% 24h</p>
        </div>
      </div>

      <Chart points={series} up={up} />

      <div className="mt-1 flex gap-1.5">
        {RANGES.map((r) => (
          <button key={r} onClick={() => setRange(r)} className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-colors ${range === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
            {r}
          </button>
        ))}
      </div>

      {target != null && gap != null && (
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{targetLabel}</span>
          <span className="num font-bold text-foreground">{fmtUsd(target)} · {gap >= 0 ? "+" : ""}{gap.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}
