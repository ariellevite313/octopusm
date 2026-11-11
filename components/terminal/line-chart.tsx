"use client";

/** Graphique en ligne du Terminal (style épuré : pas d'axes, ligne du dernier prix, étiquette du prix). Données GeckoTerminal. */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";

export type TRange = "LIVE" | "1H" | "4H" | "1D" | "7D" | "ALL";
export const T_RANGES: TRange[] = ["LIVE", "1H", "4H", "1D", "7D", "ALL"];
const TF: Record<TRange, [string, number, number]> = {
  LIVE: ["minute", 1, 30], "1H": ["minute", 1, 60], "4H": ["minute", 5, 48], "1D": ["minute", 15, 96], "7D": ["hour", 2, 84], ALL: ["day", 1, 365],
};

type Pt = { time: number; value: number };

async function loadPoints(pool: string, r: TRange): Promise<Pt[]> {
  const [tf, agg, limit] = TF[r];
  const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/${tf}?aggregate=${agg}&limit=${limit}&currency=usd`);
  if (!res.ok) return [];
  const j = (await res.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
  const list = (j.data?.attributes?.ohlcv_list ?? []).map((c) => ({ time: c[0], value: c[4] })).filter((p) => p.value > 0);
  list.sort((a, b) => a.time - b.time);
  return list.filter((p, i) => i === 0 || p.time !== list[i - 1].time);
}

export function TerminalLineChart({ pool, range, onChange }: { pool: string; range: TRange; onChange?: (first: number, last: number) => void }) {
  const { tr } = useT();
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"load" | "ok" | "empty">("load");
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!pool || !box.current) { setState("empty"); return; }
    let dead = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null, series: any = null, timer: ReturnType<typeof setInterval> | null = null;
    setState("load");
    (async () => { try {
      const [pts, lw] = await Promise.all([loadPoints(pool, range).catch(() => []), import("lightweight-charts")]);
      if (dead || !box.current) return;
      if (pts.length < 2) { setState("empty"); return; }
      const up = pts[pts.length - 1].value >= pts[0].value;
      const color = up ? "#22c55e" : "#ef4444";
      chart = lw.createChart(box.current, {
        width: box.current.clientWidth, height: box.current.clientHeight,
        layout: { background: { type: lw.ColorType.Solid, color: "transparent" }, textColor: "#a1a1aa", attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { visible: false }, leftPriceScale: { visible: false },
        timeScale: { visible: false, borderVisible: false },
        crosshair: { horzLine: { visible: false, labelVisible: false }, vertLine: { labelVisible: false, color: "#52525b" } },
        handleScroll: false, handleScale: false,
      });
      series = chart.addSeries(lw.AreaSeries, {
        lineColor: color, lineWidth: 2, topColor: up ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)", bottomColor: "rgba(0,0,0,0)",
        priceLineVisible: true, priceLineStyle: 2, priceLineColor: color, lastValueVisible: true,
        priceFormat: { type: "price", precision: 10, minMove: 1e-10 },
      });
      series.setData(pts);
      chart.timeScale().fitContent();
      setState("ok");
      cb.current?.(pts[0].value, pts[pts.length - 1].value);
      if (range === "LIVE") {
        timer = setInterval(async () => {
          const n = await loadPoints(pool, "LIVE").catch(() => []);
          if (!dead && n.length >= 2) { series.setData(n); cb.current?.(n[0].value, n[n.length - 1].value); }
        }, 15_000);
      }
    } catch (e) { console.error("[terminal-chart]", e); if (!dead) setState("empty"); } })();
    const ro = new ResizeObserver(() => { if (chart && box.current) chart.applyOptions({ width: box.current.clientWidth, height: box.current.clientHeight }); });
    ro.observe(box.current);
    return () => { dead = true; ro.disconnect(); if (timer) clearInterval(timer); try { chart?.remove(); } catch { /* déjà retiré */ } };
  }, [pool, range]);

  return (
    <div className="relative h-[300px] w-full md:h-[360px]">
      <div ref={box} className="absolute inset-0" />
      {state !== "ok" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {state === "load" ? <Loader2 className="size-5 animate-spin" /> : tr("Chart unavailable")}
        </div>
      )}
    </div>
  );
}
