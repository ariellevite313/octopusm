"use client";

/**
 * Graphique « pro » du Terminal sur ordinateur : bougies avec axes, volume, moyennes mobiles et outils de dessin
 * (ligne horizontale, tendance, retracement de Fibonacci). Un clic sur un niveau Fibonacci ou une ligne horizontale
 * envoie le prix au parent (onLevel) pour préparer un ordre limite. Les tracés sont gardés par token dans le navigateur.
 * Données GeckoTerminal (OHLCV), même source que le graphique mobile.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, MousePointer2, Minus, TrendingUp, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Mirage } from "@/components/shared/mirage";

export type ProTf = "1m" | "5m" | "15m" | "1H" | "4H" | "1D";
export const PRO_TFS: ProTf[] = ["1m", "5m", "15m", "1H", "4H", "1D"];
const TF: Record<ProTf, [string, number]> = { "1m": ["minute", 1], "5m": ["minute", 5], "15m": ["minute", 15], "1H": ["hour", 1], "4H": ["hour", 4], "1D": ["day", 1] };

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
const FIB_COLORS = ["#9ca3af", "#ef4444", "#f59e0b", "#22c55e", "currentColor", "#3b82f6", "#9ca3af"];

type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };
type P = { t: number; p: number };
export type Drawing = { id: string; kind: "fib"; a: P; b: P } | { id: string; kind: "trend"; a: P; b: P } | { id: string; kind: "hline"; p: number };
type Tool = "cursor" | "hline" | "trend" | "fib";

async function loadBars(pool: string, tf: ProTf, net: string): Promise<Bar[]> {
  const [unit, agg] = TF[tf];
  const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/pools/${pool}/ohlcv/${unit}?aggregate=${agg}&limit=300&currency=usd`);
  if (!r.ok) return [];
  const j = (await r.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
  const list = (j.data?.attributes?.ohlcv_list ?? []).map((c) => ({ time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] ?? 0 })).filter((b) => b.close > 0);
  list.sort((a, b) => a.time - b.time);
  return list.filter((b, i) => i === 0 || b.time !== list[i - 1].time);
}

/** Prix lisible (2 décimales au-dessus de 1, sinon 4 chiffres significatifs) */
export function fmtP(p: number): string {
  if (!isFinite(p) || p <= 0) return "";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(p >= 100 ? 2 : 3);
  return p.toFixed(Math.min(14, Math.max(3, 3 - Math.floor(Math.log10(p)))));
}
const fmtMc = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);

/** Prix d'un niveau de Fibonacci : 0 au point haut, 1 au point bas (retracement d'une hausse), ou l'inverse si le tracé descend */
export function fibPrice(a: number, b: number, level: number): number { return b - (b - a) * level; }

function sma(bars: Bar[], n: number) {
  const out: { time: number; value: number }[] = [];
  let s = 0;
  for (let i = 0; i < bars.length; i++) {
    s += bars[i].close;
    if (i >= n) s -= bars[i - n].close;
    if (i >= n - 1) out.push({ time: bars[i].time, value: s / n });
  }
  return out;
}

const KEY = (mint: string) => `om-draw:${mint}`;
function readDrawings(mint: string): Drawing[] { try { const v = JSON.parse(localStorage.getItem(KEY(mint)) ?? "[]"); return Array.isArray(v) ? v.slice(0, 30) : []; } catch { return []; } }
function writeDrawings(mint: string, d: Drawing[]) { try { localStorage.setItem(KEY(mint), JSON.stringify(d.slice(0, 30))); } catch { /* stockage indisponible */ } }

export function ProChart({ mint, pool, network = "solana", mcapPerPrice, onLevel, title }: {
  mint: string; pool: string; network?: string;
  /** nom affiché en plein écran (ex. « SOL ») */
  title?: string;
  /** capitalisation / prix : pour afficher la capitalisation de chaque niveau */
  mcapPerPrice: number | null;
  /** clic sur un niveau : prix du niveau et libellé (ex. « Fib 61.8% ») */
  onLevel?: (price: number, label: string) => void;
}) {
  const { tr } = useT();
  const box = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // Plein écran : celui du navigateur si possible, sinon le graphique couvre toute la fenêtre
  const [full, setFull] = useState(false);
  const toggleFull = () => {
    const el = root.current;
    if (!el) return;
    if (document.fullscreenElement) { void document.exitFullscreen(); return; }
    if (full) { setFull(false); return; }
    if (el.requestFullscreen) el.requestFullscreen().then(() => setFull(true)).catch(() => setFull(true));
    else setFull(true);
  };
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useRef<{ chart: any; series: any; bars: Bar[] } | null>(null);
  const [tf, setTfState] = useState<ProTf>("1H");
  useEffect(() => { try { const v = localStorage.getItem("om-pro-tf") as ProTf | null; if (v && PRO_TFS.includes(v)) setTfState(v); } catch { /* stockage indisponible */ } }, []);
  const setTf = (v: ProTf) => { setTfState(v); try { localStorage.setItem("om-pro-tf", v); } catch { /* stockage indisponible */ } };
  const [state, setState] = useState<"load" | "ok" | "empty">("load");
  const [tool, setTool] = useState<Tool>("cursor");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [pending, setPending] = useState<P | null>(null);
  const [hoverPt, setHoverPt] = useState<P | null>(null);
  const [legend, setLegend] = useState<Bar | null>(null);
  const [, setTick] = useState(0);
  const redraw = useCallback(() => setTick((x) => x + 1), []);

  useEffect(() => { setDrawings(readDrawings(mint)); setPending(null); setTool("cursor"); }, [mint]);
  const save = (d: Drawing[]) => { setDrawings(d); writeDrawings(mint, d); };

  // Esc : annule le tracé en cours
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setPending(null); setTool("cursor"); if (!document.fullscreenElement) setFull(false); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useEffect(() => {
    if (!pool || !box.current) { setState("empty"); return; }
    let dead = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null;
    setState("load");
    (async () => {
      try {
        const [bars, lw] = await Promise.all([loadBars(pool, tf, network).catch(() => []), import("lightweight-charts")]);
        if (dead || !box.current) return;
        if (bars.length < 2) { setState("empty"); return; }
        const dark = document.documentElement.classList.contains("dark");
        const text = dark ? "#8b8b94" : "#71717a", grid = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
        chart = lw.createChart(box.current, {
          width: box.current.clientWidth, height: box.current.clientHeight,
          layout: { background: { type: lw.ColorType.Solid, color: "transparent" }, textColor: text, fontSize: 11, attributionLogo: false },
          grid: { vertLines: { color: grid }, horzLines: { color: grid } },
          rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.24 } },
          timeScale: { borderVisible: false, timeVisible: tf !== "1D", secondsVisible: false, rightOffset: 6 },
          crosshair: { mode: 0 },
        });
        const series = chart.addSeries(lw.CandlestickSeries, {
          upColor: "#22c55e", downColor: "#ef4444", wickUpColor: "#22c55e", wickDownColor: "#ef4444", borderVisible: false,
          priceFormat: { type: "custom", formatter: fmtP, minMove: 1e-10 },
        });
        series.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
        const vol = chart.addSeries(lw.HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        vol.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)" })));
        for (const [n, color] of [[7, "#f2c14e"], [25, "#d946ef"], [99, "#22d3ee"]] as const) {
          if (bars.length > n) chart.addSeries(lw.LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(sma(bars, n));
        }
        chart.timeScale().fitContent();
        api.current = { chart, series, bars };
        chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chart.subscribeCrosshairMove((param: any) => {
          const i = param?.logical != null ? Math.round(param.logical) : -1;
          setLegend(i >= 0 && i < bars.length ? bars[i] : null);
        });
        setLegend(null);
        setState("ok");
        setTimeout(redraw, 0);
      } catch (e) { console.error("[pro-chart]", e); if (!dead) setState("empty"); }
    })();
    let lastW = 0;
    const ro = new ResizeObserver(() => {
      if (!chart || !box.current) return;
      const w = box.current.clientWidth;
      chart.applyOptions({ width: w, height: box.current.clientHeight });
      // Largeur changée (liste repliée, fenêtre) : le graphique reprend toute la place
      if (Math.abs(w - lastW) > 40) { lastW = w; try { chart.timeScale().fitContent(); } catch { /* retiré */ } }
      redraw();
    });
    ro.observe(box.current);
    return () => { dead = true; ro.disconnect(); api.current = null; try { chart?.remove(); } catch { /* déjà retiré */ } };
  }, [pool, tf, network, redraw]);

  // Conversions temps/prix <-> écran (le temps est interpolé entre les bougies : les tracés suivent tous les intervalles)
  const xOf = (t: number): number | null => {
    const a = api.current; if (!a) return null;
    const b = a.bars, n = b.length;
    let i = 0, lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (b[m].time <= t) lo = m; else hi = m - 1; }
    i = lo;
    const step = n > 1 ? b[1].time - b[0].time : 60;
    const frac = i < n - 1 ? (t - b[i].time) / (b[i + 1].time - b[i].time) : (t - b[n - 1].time) / step;
    const x = a.chart.timeScale().logicalToCoordinate(i + frac);
    return x == null ? null : x;
  };
  const yOf = (p: number): number | null => { const v = api.current?.series.priceToCoordinate(p); return v == null ? null : v; };
  const ptAt = (x: number, y: number): P | null => {
    const a = api.current; if (!a) return null;
    const l = a.chart.timeScale().coordinateToLogical(x), p = a.series.coordinateToPrice(y);
    if (l == null || p == null || !(p > 0)) return null;
    const b = a.bars, n = b.length, step = n > 1 ? b[1].time - b[0].time : 60;
    const i = Math.max(0, Math.min(n - 1, Math.floor(l)));
    const t = l >= n - 1 ? b[n - 1].time + (l - (n - 1)) * step : b[i].time + (l - i) * (b[Math.min(n - 1, i + 1)].time - b[i].time);
    return { t, p };
  };

  function onOverlay(e: React.MouseEvent<SVGSVGElement>) {
    if (tool === "cursor") return;
    const r = e.currentTarget.getBoundingClientRect();
    const pt = ptAt(e.clientX - r.left, e.clientY - r.top);
    if (!pt) return;
    const id = Math.random().toString(36).slice(2, 9);
    if (tool === "hline") { save([...drawings, { id, kind: "hline", p: pt.p }]); setTool("cursor"); return; }
    if (!pending) { setPending(pt); return; }
    save([...drawings, { id, kind: tool, a: pending, b: pt }]);
    setPending(null); setTool("cursor");
  }
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!pending) return;
    const r = e.currentTarget.getBoundingClientRect();
    setHoverPt(ptAt(e.clientX - r.left, e.clientY - r.top));
  }

  const W = box.current?.clientWidth ?? 0, axis = 64, right = Math.max(0, W - axis);
  const mc = (p: number) => (mcapPerPrice && mcapPerPrice > 0 ? ` ${fmtMc(p * mcapPerPrice)}` : "");

  function renderFib(d: { id: string; a: P; b: P }, preview = false) {
    const xa = xOf(Math.min(d.a.t, d.b.t)); if (xa == null) return null;
    const hi = Math.max(d.a.p, d.b.p), lo = Math.min(d.a.p, d.b.p);
    // Tracé vers le haut : 0 en haut (retracement d'une hausse). Vers le bas : 0 en bas.
    const upMove = d.b.t >= d.a.t ? d.b.p >= d.a.p : d.a.p >= d.b.p;
    const start = upMove ? hi : lo, end = upMove ? lo : hi;
    return (
      <g key={d.id} opacity={preview ? 0.6 : 1}>
        {FIB_LEVELS.map((lv, k) => {
          const p = fibPrice(end, start, lv), y = yOf(p);
          if (y == null) return null;
          const col = FIB_COLORS[k], label = `${lv} (${fmtP(p)})${mc(p)}`;
          return (
            <g key={lv} className="text-foreground">
              <line x1={Math.max(0, xa)} x2={right} y1={y} y2={y} stroke={col} strokeWidth={lv === 0.618 ? 1.6 : 1} strokeDasharray={lv === 0.618 ? undefined : "4 4"} />
              {!preview && (
                <g style={{ cursor: "pointer", pointerEvents: "auto" }} onClick={(e) => { e.stopPropagation(); onLevel?.(p, `Fib ${(lv * 100).toFixed(1)}%`); }}>
                  <rect x={Math.max(0, xa)} y={y - 6} width={Math.max(0, right - Math.max(0, xa))} height={12} fill="transparent" />
                  <text x={Math.max(4, xa + 4)} y={y - 4} fontSize={11} fontWeight={700} fill={col} stroke="var(--background)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">{label}</text>
                </g>
              )}
            </g>
          );
        })}
      </g>
    );
  }

  return (
    <div ref={root} className={`flex h-full flex-col bg-background ${full ? "fixed inset-0 z-[120]" : ""}`}>
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        {full && title && <span className="mr-2 pl-1 text-[14px] font-bold text-foreground">{title}</span>}
        {PRO_TFS.map((k) => (
          <button key={k} onClick={() => setTf(k)} className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${tf === k ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{k}</button>
        ))}
        {legend && (
          <span className="num ml-3 truncate text-[11px] text-muted-foreground">
            O <span className={legend.close >= legend.open ? "text-up" : "text-down"}>{fmtP(legend.open)}</span>{" "}
            H <span className={legend.close >= legend.open ? "text-up" : "text-down"}>{fmtP(legend.high)}</span>{" "}
            L <span className={legend.close >= legend.open ? "text-up" : "text-down"}>{fmtP(legend.low)}</span>{" "}
            C <span className={legend.close >= legend.open ? "text-up" : "text-down"}>{fmtP(legend.close)}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-[11px] font-semibold">
          <span style={{ color: "#f2c14e" }}>MA 7</span><span style={{ color: "#d946ef" }}>MA 25</span><span style={{ color: "#22d3ee" }}>MA 99</span>
          <button onClick={toggleFull} title={full ? tr("Exit full screen") : tr("Full screen")} aria-label={full ? tr("Exit full screen") : tr("Full screen")}
            className="ml-1 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* Outils de dessin */}
        <div className="flex w-11 shrink-0 flex-col items-center gap-1.5 border-r border-border py-2">
          {([["cursor", MousePointer2, tr("Cursor")], ["hline", Minus, tr("Horizontal line")], ["trend", TrendingUp, tr("Trend line")], ["fib", null, tr("Fib retracement")]] as const).map(([k, Icon, label]) => (
            <button key={k} onClick={() => { setTool(k); setPending(null); }} title={label} aria-label={label} aria-pressed={tool === k}
              className={`flex size-8 items-center justify-center rounded-lg ${tool === k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              {Icon ? <Icon className="size-4" /> : (
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 4h18M3 9h18M3 13.5h18M3 18h18M3 21h18" /></svg>
              )}
            </button>
          ))}
          <button onClick={() => { save([]); setPending(null); }} title={tr("Clear drawings")} aria-label={tr("Clear drawings")} className="mt-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <Trash2 className="size-4" />
          </button>
        </div>
        <div className="relative min-w-0 flex-1">
          <div ref={box} className="absolute inset-0" />
          {state === "ok" && (
            <svg className="absolute inset-0 h-full w-full" style={{ zIndex: 5, pointerEvents: tool === "cursor" ? "none" : "all", cursor: tool === "cursor" ? "default" : "crosshair" }}
              onClick={onOverlay} onMouseMove={onMove}>
              {drawings.map((d) => {
                if (d.kind === "fib") return renderFib(d);
                if (d.kind === "hline") {
                  const y = yOf(d.p); if (y == null) return null;
                  return (
                    <g key={d.id} className="text-foreground" style={{ cursor: "pointer", pointerEvents: "auto" }} onClick={(e) => { e.stopPropagation(); onLevel?.(d.p, tr("Line")); }}>
                      <line x1={0} x2={right} y1={y} y2={y} stroke="currentColor" strokeWidth={1.2} />
                      <rect x={0} y={y - 6} width={right} height={12} fill="transparent" />
                      <text x={6} y={y - 4} fontSize={11} fontWeight={700} fill="currentColor" stroke="var(--background)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">{fmtP(d.p)}{mc(d.p)}</text>
                    </g>
                  );
                }
                const x1 = xOf(d.a.t), y1 = yOf(d.a.p), x2 = xOf(d.b.t), y2 = yOf(d.b.p);
                if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
                return <line key={d.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3b82f6" strokeWidth={1.6} />;
              })}
              {pending && hoverPt && (tool === "fib" ? renderFib({ id: "preview", a: pending, b: hoverPt }, true) : (() => {
                const x1 = xOf(pending.t), y1 = yOf(pending.p), x2 = xOf(hoverPt.t), y2 = yOf(hoverPt.p);
                return x1 == null || y1 == null || x2 == null || y2 == null ? null : <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3b82f6" strokeWidth={1.4} strokeDasharray="4 3" />;
              })())}
              {pending && (() => { const x = xOf(pending.t), y = yOf(pending.p); return x == null || y == null ? null : <circle cx={x} cy={y} r={5} fill="none" stroke="currentColor" strokeWidth={2} className="text-foreground" />; })()}
            </svg>
          )}
          {tool !== "cursor" && state === "ok" && (
            <p className="pointer-events-none absolute left-3 top-2 z-[6] rounded-md bg-background/90 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {tool === "hline" ? tr("Click the chart to place the line") : pending ? tr("Click the second point") : tool === "fib" ? tr("Click the low, then the high") : tr("Click the first point")}
            </p>
          )}
          {state !== "ok" && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              {state === "load" ? <Mirage className="size-5" /> : tr("Chart unavailable")}
            </div>
          )}
        </div>
      </div>
      {drawings.some((d) => d.kind === "fib") && (
        <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">{tr("Click a Fibonacci level or a line to set your limit order there.")}</p>
      )}
    </div>
  );
}
