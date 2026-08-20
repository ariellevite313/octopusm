"use client";

/**
 * TokenChart — Multi-timeframe candlestick + live line chart
 * Data: GeckoTerminal API (free, no key)
 * Renderer: TradingView Lightweight Charts v5
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { Loader2, CandlestickChart, TrendingUp } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Bar = { time: number; open: number; high: number; low: number; close: number };
type Status = "loading" | "nodata" | "error" | "ready";
type ChartType = "candle" | "line";

type Timeframe = { label: string; path: string };

const TIMEFRAMES: Timeframe[] = [
  { label: "1m",  path: "minute?aggregate=1&limit=200"  },
  { label: "5m",  path: "minute?aggregate=5&limit=200"  },
  { label: "15m", path: "minute?aggregate=15&limit=200" },
  { label: "1h",  path: "hour?aggregate=1&limit=200"    },
  { label: "4h",  path: "hour?aggregate=4&limit=200"    },
  { label: "1j",  path: "day?aggregate=1&limit=200"     },
];

const DEFAULT_TF = TIMEFRAMES[1]; // 5m
const LIVE_REFRESH_MS = 30_000;   // refresh line chart every 30s

// ── GeckoTerminal helpers ─────────────────────────────────────────────────────

type RawList = [number, string | number, string | number, string | number, string | number, string | number][];

function parseOHLCV(list: RawList): Bar[] {
  return list
    .map(([t, o, h, l, c]) => ({
      time:  Number(t),
      open:  Number(o),
      high:  Number(h),
      low:   Number(l),
      close: Number(c),
    }))
    .filter(b => b.open > 0 && b.time > 1_000_000_000)
    .reverse();
}

async function resolvePool(mintAddress: string): Promise<string> {
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mintAddress}/pools?page=1`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) throw new Error("Pool introuvable");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any;
  const addr = json?.data?.[0]?.attributes?.address as string | undefined;
  if (!addr) throw new Error("Pool not found");
  return addr;
}

async function fetchBars(poolAddress: string, tf: Timeframe): Promise<Bar[]> {
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/${tf.path}&currency=usd`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) throw new Error("Data unavailable");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any;
  const list = json?.data?.attributes?.ohlcv_list as RawList | undefined;
  if (!list?.length) throw new Error("No data");
  return parseOHLCV(list);
}

// ── Component ─────────────────────────────────────────────────────────────────

function getChartTheme(isDark: boolean) {
  return isDark
    ? {
        background:  "#000000",
        text:        "#555555",
        grid:        "#111111",
        border:      "#1a1a1a",
      }
    : {
        background:  "#ffffff",
        text:        "#666666",
        grid:        "#e5e7eb",
        border:      "#d1d5db",
      };
}

export function TokenChart({ mintAddress, name }: { mintAddress: string; name: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const wrapperRef = useRef<HTMLDivElement>(null);
  const poolRef    = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef   = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef  = useRef<any>(null);
  const roRef      = useRef<ResizeObserver | null>(null);
  const liveTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref mirrors for stale-closure safety inside setInterval
  const activeTfRef   = useRef<Timeframe>(DEFAULT_TF);
  const chartTypeRef  = useRef<ChartType>("candle");

  const [status,    setStatus]    = useState<Status>("loading");
  const [errorMsg,  setErrorMsg]  = useState("");
  const [activeTf,  setActiveTf]  = useState<Timeframe>(DEFAULT_TF);
  const [chartType, setChartType] = useState<ChartType>("candle");
  const [tfLoading, setTfLoading] = useState(false);

  // ── Build / rebuild series ────────────────────────────────────────────────────
  const buildSeries = useCallback(async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lw: any,
    bars: Bar[],
    type: ChartType,
  ) => {
    if (!chartRef.current) return;

    // Remove existing series
    if (seriesRef.current) {
      try { chartRef.current.removeSeries(seriesRef.current); } catch { /* ignore */ }
      seriesRef.current = null;
    }

    if (type === "candle") {
      const { CandlestickSeries } = lw;
      const series = chartRef.current.addSeries(CandlestickSeries, {
        upColor:         "#22c55e",
        downColor:       "#ef4444",
        borderUpColor:   "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor:     "#22c55e",
        wickDownColor:   "#ef4444",
        priceFormat:     { type: "price", precision: 8, minMove: 0.00000001 },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (series as any).setData(bars);
      seriesRef.current = series;
    } else {
      // AreaSeries (v5) or LineSeries fallback (v4)
      const SeriesClass = lw.AreaSeries ?? lw.LineSeries;
      const lineData = bars.map(b => ({ time: b.time, value: b.close }));
      const series = chartRef.current.addSeries(SeriesClass, {
        lineColor:   "#00e87a",
        topColor:    "rgba(0,232,122,0.15)",
        bottomColor: "rgba(0,232,122,0.0)",
        lineWidth:   1.5,
        priceFormat: { type: "price", precision: 8, minMove: 0.00000001 },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (series as any).setData(lineData);
      seriesRef.current = series;
    }

    chartRef.current.timeScale().fitContent();
  }, []);

  // ── Initial chart setup ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const pool = await resolvePool(mintAddress);
        if (cancelled) return;
        poolRef.current = pool;

        const [lw, bars] = await Promise.all([
          import("lightweight-charts"),
          fetchBars(pool, DEFAULT_TF),
        ]);
        if (cancelled || !wrapperRef.current) return;
        if (!bars.length) { setStatus("nodata"); return; }

        const { createChart, ColorType } = lw;
        const t = getChartTheme(isDark);

        const chart = createChart(wrapperRef.current, {
          width:  wrapperRef.current.clientWidth,
          height: 440,
          layout: {
            background: { type: ColorType.Solid, color: t.background },
            textColor: t.text,
          },
          grid: {
            vertLines: { color: t.grid },
            horzLines: { color: t.grid, style: 3 },
          },
          crosshair: { mode: 1 },
          rightPriceScale: { borderColor: t.border },
          timeScale:       { borderColor: t.border, timeVisible: true, secondsVisible: false },
          watermark:       { visible: false },
        });

        chartRef.current = chart;
        await buildSeries(lw, bars, "candle");
        setStatus("ready");

        const ro = new ResizeObserver(() => {
          if (wrapperRef.current) chart.applyOptions({ width: wrapperRef.current.clientWidth });
        });
        ro.observe(wrapperRef.current);
        roRef.current = ro;
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(e instanceof Error ? e.message : "Chart unavailable");
          setStatus("error");
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
      if (liveTimer.current) clearInterval(liveTimer.current);
      chartRef.current?.remove();
      roRef.current?.disconnect();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintAddress]);

  // ── Re-apply theme when it changes ───────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    const t = getChartTheme(isDark);
    import("lightweight-charts").then(({ ColorType }) => {
      chartRef.current?.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: t.background },
          textColor: t.text,
        },
        grid: {
          vertLines: { color: t.grid },
          horzLines: { color: t.grid, style: 3 },
        },
        rightPriceScale: { borderColor: t.border },
        timeScale:       { borderColor: t.border },
      });
    });
  }, [isDark]);

  // ── Switch timeframe ──────────────────────────────────────────────────────────
  const switchTf = useCallback(async (tf: Timeframe) => {
    if (!poolRef.current || !chartRef.current || tfLoading) return;
    setActiveTf(tf);
    activeTfRef.current = tf; // keep ref in sync for live timer
    setTfLoading(true);
    try {
      const [lw, bars] = await Promise.all([
        import("lightweight-charts"),
        fetchBars(poolRef.current, tf),
      ]);
      if (bars.length) await buildSeries(lw, bars, chartTypeRef.current);
    } catch { /* keep existing */ }
    finally { setTfLoading(false); }
  }, [tfLoading, buildSeries]);

  // ── Switch chart type ─────────────────────────────────────────────────────────
  const switchType = useCallback(async (type: ChartType) => {
    if (!poolRef.current || !chartRef.current) return;
    setChartType(type);
    chartTypeRef.current = type; // keep ref in sync

    // Stop existing live timer
    if (liveTimer.current) { clearInterval(liveTimer.current); liveTimer.current = null; }

    setTfLoading(true);
    try {
      const [lw, bars] = await Promise.all([
        import("lightweight-charts"),
        fetchBars(poolRef.current, activeTfRef.current), // use ref, not stale state
      ]);
      if (bars.length) await buildSeries(lw, bars, type);

      // Auto-refresh every 30s for line chart — use refs to avoid stale closures
      if (type === "line") {
        liveTimer.current = setInterval(async () => {
          if (!poolRef.current || !seriesRef.current) return;
          try {
            const [lw2, freshBars] = await Promise.all([
              import("lightweight-charts"),
              fetchBars(poolRef.current, activeTfRef.current), // always latest TF
            ]);
            await buildSeries(lw2, freshBars, "line");
          } catch { /* ignore */ }
        }, LIVE_REFRESH_MS);
      }
    } catch { /* keep existing */ }
    finally { setTfLoading(false); }
  }, [buildSeries]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: isDark ? "#000" : "#fff" }}>
      <style>{`.tv-lightweight-charts a[href*="tradingview"]{display:none!important}`}</style>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2">
        {/* Chart type toggle */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            disabled={status !== "ready"}
            onClick={() => switchType("candle")}
            title="Candlestick"
            className={`p-1.5 rounded-lg transition-colors ${
              chartType === "candle"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <CandlestickChart className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={status !== "ready"}
            onClick={() => switchType("line")}
            title="Live line"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              chartType === "line"
                ? "bg-violet-600 text-white"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <TrendingUp className="size-3.5" />
            Live
          </button>
        </div>

        {/* Timeframe buttons */}
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.label}
              type="button"
              disabled={status !== "ready" || tfLoading}
              onClick={() => switchTf(tf)}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                activeTf.label === tf.label
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {tf.label}
            </button>
          ))}
          {tfLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground ml-1" />}
        </div>

        {/* Live indicator */}
        {chartType === "line" && !tfLoading && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-emerald-500 font-medium">Live</span>
          </div>
        )}
      </div>

      {/* States */}
      {status === "loading" && (
        <div className="flex items-center justify-center" style={{ height: 440 }}>
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center justify-center" style={{ height: 440 }}>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
        </div>
      )}
      {status === "nodata" && (
        <div className="flex items-center justify-center" style={{ height: 440 }}>
          <p className="text-sm text-muted-foreground">No price data yet.</p>
        </div>
      )}

      {/* Chart */}
      <div ref={wrapperRef} style={{ display: status === "ready" ? "block" : "none" }} />
    </div>
  );
}
