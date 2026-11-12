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

export type ChartMode = "line" | "candle";
/** Prix lisible : 2 décimales au-dessus de 1, sinon 4 chiffres significatifs (sans notation scientifique) */
function fmtPrice(p: number): string {
  if (!isFinite(p) || p <= 0) return "";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(p >= 100 ? 2 : 3);
  return p.toFixed(Math.min(14, Math.max(3, 3 - Math.floor(Math.log10(p)))));
}
type Pt = { time: number; value: number; open: number; high: number; low: number };

async function loadPoints(pool: string, r: TRange, net = "solana"): Promise<Pt[]> {
  const [tf, agg, limit] = TF[r];
  const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/pools/${pool}/ohlcv/${tf}?aggregate=${agg}&limit=${limit}&currency=usd`);
  if (!res.ok) return [];
  const j = (await res.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
  const list = (j.data?.attributes?.ohlcv_list ?? []).map((c) => ({ time: c[0], open: c[1], high: c[2], low: c[3], value: c[4] })).filter((p) => p.value > 0);
  list.sort((a, b) => a.time - b.time);
  return list.filter((p, i) => i === 0 || p.time !== list[i - 1].time);
}

export function TerminalLineChart({ pool, range, onChange, heightClass = "h-[300px] md:h-[360px]", network = "solana", mode = "line", fallbackPrice = null }: { pool: string; range: TRange; mode?: ChartMode; onChange?: (first: number, last: number) => void; heightClass?: string; network?: string; fallbackPrice?: number | null }) {
  const { tr } = useT();
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"load" | "ok" | "empty">("load");
  const [dot, setDot] = useState<{ x: number; y: number; color: string } | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if ((!pool && !(fallbackPrice && fallbackPrice > 0)) || !box.current) { setState("empty"); return; }
    let dead = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null, series: any = null, timer: ReturnType<typeof setInterval> | null = null;
    setState("load");
    (async () => { try {
      const [first, lw] = await Promise.all([pool ? loadPoints(pool, range, network).catch(() => []) : Promise.resolve([] as Pt[]), import("lightweight-charts")]);
      let pts = first;
      // Pas de volume sur cette periode : on essaie l'historique complet, puis une ligne plate au prix connu
      if (pts.length < 2 && pool && range !== "ALL") pts = await loadPoints(pool, "ALL", network).catch(() => []);
      if (pts.length < 2 && fallbackPrice && fallbackPrice > 0) {
        const now = Math.floor(Date.now() / 1000), p = fallbackPrice;
        pts = [{ time: now - 3600, value: p, open: p, high: p, low: p }, { time: now, value: p, open: p, high: p, low: p }];
      }
      if (dead || !box.current) return;
      if (pts.length < 2) { setState("empty"); return; }
      const up = pts[pts.length - 1].value >= pts[0].value;
      const color = up ? "#22c55e" : "#ef4444";
      chart = lw.createChart(box.current, {
        width: box.current.clientWidth, height: box.current.clientHeight,
        layout: { background: { type: lw.ColorType.Solid, color: "transparent" }, textColor: "rgba(0,0,0,0)", attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { visible: true, borderVisible: false, ticksVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } }, leftPriceScale: { visible: false },
        timeScale: { visible: false, borderVisible: false, rightOffset: 2 },
        crosshair: { horzLine: { visible: false, labelVisible: false }, vertLine: { labelVisible: false, color: "#52525b" } },
        handleScroll: false, handleScale: false,
      });
      const candle = mode === "candle";
      const toData = (a: Pt[]) => (candle ? a.map((p) => ({ time: p.time, open: p.open, high: p.high, low: p.low, close: p.value })) : a.map((p) => ({ time: p.time, value: p.value })));
      series = candle
        ? chart.addSeries(lw.CandlestickSeries, {
            upColor: "#22c55e", downColor: "#ef4444", wickUpColor: "#22c55e", wickDownColor: "#ef4444", borderVisible: false,
            priceLineVisible: true, priceLineStyle: 2, priceLineColor: color, lastValueVisible: true,
            priceFormat: { type: "custom", formatter: fmtPrice, minMove: 1e-10 },
          })
        : chart.addSeries(lw.AreaSeries, {
            lineColor: color, lineWidth: 2, topColor: up ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)", bottomColor: "rgba(0,0,0,0)",
            priceLineVisible: true, priceLineStyle: 2, priceLineColor: color, lastValueVisible: true,
            priceFormat: { type: "custom", formatter: fmtPrice, minMove: 1e-10 },
          });
      let lastPt = pts[pts.length - 1];
      const placeDot = () => {
        if (dead || !chart || !series) return;
        const x = chart.timeScale().timeToCoordinate(lastPt.time), y = series.priceToCoordinate(lastPt.value);
        setDot(x == null || y == null ? null : { x, y, color });
      };
      series.setData(toData(pts));
      chart.timeScale().fitContent();
      chart.timeScale().subscribeVisibleLogicalRangeChange(placeDot);
      setTimeout(placeDot, 0);
      setState("ok");
      cb.current?.(pts[0].value, pts[pts.length - 1].value);
      if (range === "LIVE") {
        timer = setInterval(async () => {
          const n = await loadPoints(pool, "LIVE", network).catch(() => []);
          if (!dead && n.length >= 2) { series.setData(toData(n)); lastPt = n[n.length - 1]; placeDot(); cb.current?.(n[0].value, n[n.length - 1].value); }
        }, 15_000);
      }
    } catch (e) { console.error("[terminal-chart]", e); if (!dead) setState("empty"); } })();
    const ro = new ResizeObserver(() => { if (chart && box.current) { chart.applyOptions({ width: box.current.clientWidth, height: box.current.clientHeight }); setTimeout(() => { try { chart.timeScale().fitContent(); } catch { /* retiré */ } }, 0); } });
    ro.observe(box.current);
    return () => { dead = true; ro.disconnect(); if (timer) clearInterval(timer); try { chart?.remove(); } catch { /* déjà retiré */ } };
  }, [pool, range, network, mode, fallbackPrice]);

  return (
    <div className={`relative w-full ${heightClass}`}>
      <div ref={box} className="absolute inset-0" />
      {state === "ok" && dot && mode !== "candle" && (
        <span className="pointer-events-none absolute" style={{ left: dot.x, top: dot.y, transform: "translate(-50%, -50%)" }}>
          <span className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full opacity-40" style={{ background: dot.color }} />
          <span className="relative block size-2.5 rounded-full" style={{ background: dot.color }} />
        </span>
      )}
      {state !== "ok" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {state === "load" ? <Loader2 className="size-5 animate-spin" /> : tr("Chart unavailable")}
        </div>
      )}
    </div>
  );
}
