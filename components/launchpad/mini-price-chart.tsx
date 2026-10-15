"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Mini-courbe de prix pour les lignes de la liste.
 * Charge la série quand la ligne devient visible ; sans données (pas de volume),
 * affiche une ligne plate au prix actuel.
 */
export type Trend = "up" | "down" | "flat";

export function MiniPriceChart({ chain, pool, mint, curve, className = "", onTrend }: {
  chain: string; pool?: string | null; mint?: string | null; curve?: string | null; className?: string;
  onTrend?: (t: Trend) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId();
  const [points, setPoints] = useState<number[] | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      const q = new URLSearchParams({ chain });
      if (pool)  q.set("pool", pool);
      if (mint)  q.set("mint", mint);
      if (curve) q.set("curve", curve);
      fetch(`/api/launchpad/sparkline?${q}`)
        .then(r => (r.ok ? r.json() : { points: [] }))
        .then((d: { points?: number[] }) => { if (!cancelled) setPoints(d.points ?? []); })
        .catch(() => { if (!cancelled) setPoints([]); });
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [chain, pool, mint, curve]);

  const W = 100, H = 32;
  const pts = points && points.length >= 2 ? points : null;
  let d = `M0 ${H / 2} L${W} ${H / 2}`;
  let up = true;
  if (pts) {
    const min = Math.min(...pts), max = Math.max(...pts);
    const span = max - min || 1;
    d = pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * W;
      const y = max === min ? H / 2 : 2 + (1 - (p - min) / span) * (H - 4);
      return `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ");
    up = pts[pts.length - 1] >= pts[0];
  }
  const flat = !pts || Math.min(...pts) === Math.max(...pts);
  const color = flat ? "text-muted-foreground" : up ? "text-up" : "text-down";
  const trend: Trend = flat ? "flat" : up ? "up" : "down";
  useEffect(() => { if (points !== null) onTrend?.(trend); }, [trend, points, onTrend]);
  const area = `${d} L${W} ${H} L0 ${H} Z`;
  const gid = `mpc-${uid.replace(/:/g, "")}`;

  return (
    <div
      ref={ref}
      className={`${color} ${className}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="size-full overflow-visible">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={flat ? 0 : 0.22} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}
