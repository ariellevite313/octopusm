"use client";

/**
 * TokenChart — candlestick chart styled like a professional trading UI.
 * Solana : DexScreener embed (primary) + GeckoTerminal OHLCV (fallback).
 * Arc    : on-chain trades via /api/launchpad/arc-trades → OHLCV buckets.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { Loader2, CandlestickChart, TrendingUp } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Bar    = { time: number; open: number; high: number; low: number; close: number };
type Status = "loading" | "nodata" | "error" | "ready" | "embed";
type ChartType = "candle" | "line";

type Timeframe = {
  label:       string;
  gecko?:      string;   // Solana / GeckoTerminal
  dexInterval?: number;  // Solana / DexScreener
  bucketSec?:  number;   // Arc — bucket size in seconds
};

const TIMEFRAMES: Timeframe[] = [
  { label: "1m",  gecko: "minute?aggregate=1&limit=200",  dexInterval: 1,    bucketSec: 60    },
  { label: "5m",  gecko: "minute?aggregate=5&limit=200",  dexInterval: 5,    bucketSec: 300   },
  { label: "15m", gecko: "minute?aggregate=15&limit=200", dexInterval: 15,   bucketSec: 900   },
  { label: "1h",  gecko: "hour?aggregate=1&limit=200",    dexInterval: 60,   bucketSec: 3600  },
  { label: "4h",  gecko: "hour?aggregate=4&limit=200",    dexInterval: 240,  bucketSec: 14400 },
  { label: "1D",  gecko: "day?aggregate=1&limit=200",     dexInterval: 1440, bucketSec: 86400 },
];

const DEFAULT_TF      = TIMEFRAMES[1]; // 5m
const LIVE_REFRESH_MS = 30_000;

// ── Arc helpers ───────────────────────────────────────────────────────────────

type ArcTrade = { timestamp: number; price: number };

function buildOHLCV(trades: ArcTrade[], bucketSec: number): Bar[] {
  if (!trades.length) return [];
  const map = new Map<number, Bar>();
  for (const t of trades) {
    const bucket = Math.floor(t.timestamp / bucketSec) * bucketSec;
    const ex = map.get(bucket);
    if (!ex) {
      map.set(bucket, { time: bucket, open: t.price, high: t.price, low: t.price, close: t.price });
    } else {
      ex.high  = Math.max(ex.high,  t.price);
      ex.low   = Math.min(ex.low,   t.price);
      ex.close = t.price;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

async function fetchArcBars(curveAddress: string, bucketSec: number): Promise<Bar[]> {
  const res = await fetch(`/api/launchpad/arc-trades?curveAddress=${encodeURIComponent(curveAddress)}&limit=1000`);
  if (!res.ok) throw new Error("Arc trades unavailable");
  const data = await res.json() as { trades?: ArcTrade[]; error?: string };
  if (data.error) throw new Error(data.error);
  const trades = data.trades ?? [];
  if (!trades.length) throw new Error("No trades yet — be the first!");
  return buildOHLCV(trades, bucketSec);
}

// ── DexScreener ───────────────────────────────────────────────────────────────

type DexData = { pairAddress: string; priceUsd: string; priceChange: { h24: number } };

async function resolveDex(mintAddress: string): Promise<DexData | null> {
  try {
    const res  = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const pair = json?.pairs?.[0];
    if (!pair?.pairAddress) return null;
    return {
      pairAddress:  pair.pairAddress,
      priceUsd:     pair.priceUsd   ?? "0",
      priceChange:  { h24: pair.priceChange?.h24 ?? 0 },
    };
  } catch { return null; }
}

// ── GeckoTerminal ─────────────────────────────────────────────────────────────

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

async function resolveGeckoPool(mintAddress: string): Promise<string> {
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mintAddress}/pools?page=1`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error("Pool introuvable");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json  = await res.json() as any;
  const addr  = json?.data?.[0]?.attributes?.address as string | undefined;
  if (!addr) throw new Error("Pool not found");
  return addr;
}

async function fetchBars(poolAddress: string, tf: Timeframe): Promise<Bar[]> {
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/${tf.gecko}&currency=usd`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error("Data unavailable");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any;
  const list = json?.data?.attributes?.ohlcv_list as RawList | undefined;
  if (!list?.length) throw new Error("No data");
  return parseOHLCV(list);
}

// ── Chart theme ───────────────────────────────────────────────────────────────

function getChartTheme(isDark: boolean) {
  return isDark
    ? { background: "#000000", text: "#555555", grid: "#111111", border: "#1a1a1a" }
    : { background: "#ffffff", text: "#888888", grid: "#f0f0f0", border: "#e5e5e5" };
}

// ── Price formatting ──────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  if (n === 0) return "—";
  if (n >= 1)      return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (n >= 0.01)   return n.toFixed(6);
  // small numbers: show up to 8 significant digits
  return n.toPrecision(4);
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  mintAddress?:     string;   // Solana mint
  arcCurveAddress?: string;   // Arc BondingCurve address
  name:             string;
  ticker?:          string;
  logoUrl?:         string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function TokenChart({ mintAddress, arcCurveAddress, name, ticker, logoUrl }: Props) {
  const isArc = Boolean(arcCurveAddress);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  // DexScreener
  const [dexData,    setDexData]    = useState<DexData | null>(null);
  const [embedReady, setEmbedReady] = useState(false);
  const [activeDexTf, setActiveDexTf] = useState<Timeframe>(DEFAULT_TF);

  // GeckoTerminal
  const wrapperRef   = useRef<HTMLDivElement>(null);
  const poolRef      = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef     = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef    = useRef<any>(null);
  const roRef        = useRef<ResizeObserver | null>(null);
  const liveTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeTfRef  = useRef<Timeframe>(DEFAULT_TF);
  const chartTypeRef = useRef<ChartType>("candle");

  const [status,    setStatus]    = useState<Status>("loading");
  const [errorMsg,  setErrorMsg]  = useState("");
  const [activeTf,  setActiveTf]  = useState<Timeframe>(DEFAULT_TF);
  const [chartType, setChartType] = useState<ChartType>("candle");
  const [tfLoading, setTfLoading] = useState(false);

  // Price state (both paths)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange,  setPriceChange]  = useState<number | null>(null); // % over selected TF

  // ── Step 1: init chart source ─────────────────────────────────────────────
  useEffect(() => {
    if (isArc) {
      // Arc path — no DexScreener/Gecko, fetch on-chain trades
      const clean = initArc();
      return clean;
    }
    // Solana path
    if (mintAddress) {
      resolveDex(mintAddress).then(data => {
        if (data) {
          setDexData(data);
          setCurrentPrice(parseFloat(data.priceUsd));
          setPriceChange(data.priceChange.h24);
        }
      }).catch(() => {});
    }
    const clean = initGecko();
    return clean;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintAddress, arcCurveAddress]);

  // ── Build GeckoTerminal series ─────────────────────────────────────────────
  const buildSeries = useCallback(async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lw: any,
    bars: Bar[],
    type: ChartType,
  ) => {
    if (!chartRef.current) return;
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
      const SeriesClass = lw.AreaSeries ?? lw.LineSeries;
      const lineData = bars.map(b => ({ time: b.time, value: b.close }));
      const series   = chartRef.current.addSeries(SeriesClass, {
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

    // Update price display from bars
    if (bars.length >= 1) {
      const last  = bars[bars.length - 1];
      const first = bars[0];
      setCurrentPrice(last.close);
      const pct = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
      setPriceChange(pct);
    }
  }, []);

  // ── GeckoTerminal init ─────────────────────────────────────────────────────
  function initGecko() {
    let cancelled = false;

    async function init() {
      try {
        const pool = await resolveGeckoPool(mintAddress);
        if (cancelled) return;
        poolRef.current = pool;

        const [lw, bars] = await Promise.all([
          import("lightweight-charts"),
          fetchBars(pool, DEFAULT_TF),
        ]);
        if (cancelled || !wrapperRef.current) return;
        if (!bars.length) { setStatus("nodata"); return; }

        const { createChart, ColorType } = lw;

        const chart = createChart(wrapperRef.current, {
          width:  wrapperRef.current.clientWidth,
          height: 380,
          layout: {
            background: { type: ColorType.Solid, color: getChartTheme(isDark).background },
            textColor:  getChartTheme(isDark).text,
          },
          grid: {
            vertLines: { color: getChartTheme(isDark).grid },
            horzLines: { color: getChartTheme(isDark).grid, style: 3 },
          },
          crosshair: { mode: 1 },
          rightPriceScale: { borderColor: getChartTheme(isDark).border },
          timeScale:       { borderColor: getChartTheme(isDark).border, timeVisible: true, secondsVisible: false },
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
  }

  // ── Arc init ──────────────────────────────────────────────────────────────
  function initArc() {
    let cancelled = false;

    async function init() {
      try {
        const curve = arcCurveAddress!;
        const [lw, bars] = await Promise.all([
          import("lightweight-charts"),
          fetchArcBars(curve, DEFAULT_TF.bucketSec ?? 300),
        ]);
        if (cancelled || !wrapperRef.current) return;
        if (!bars.length) { setStatus("nodata"); return; }

        const { createChart, ColorType } = lw;
        const chart = createChart(wrapperRef.current, {
          width:  wrapperRef.current.clientWidth,
          height: 380,
          layout: {
            background: { type: ColorType.Solid, color: getChartTheme(isDark).background },
            textColor:  getChartTheme(isDark).text,
          },
          grid: {
            vertLines: { color: getChartTheme(isDark).grid },
            horzLines: { color: getChartTheme(isDark).grid, style: 3 },
          },
          crosshair: { mode: 1 },
          rightPriceScale: { borderColor: getChartTheme(isDark).border },
          timeScale:       { borderColor: getChartTheme(isDark).border, timeVisible: true, secondsVisible: false },
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

        // Auto-refresh every 2min (ArcScan rate limit)
        liveTimer.current = setInterval(async () => {
          if (!chartRef.current || !arcCurveAddress) return;
          try {
            const [lw2, fresh] = await Promise.all([
              import("lightweight-charts"),
              fetchArcBars(arcCurveAddress, activeTfRef.current.bucketSec ?? 300),
            ]);
            await buildSeries(lw2, fresh, chartTypeRef.current);
          } catch { /* ignore */ }
        }, 120_000);

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
  }

  // ── GeckoTerminal theme ────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    import("lightweight-charts").then(({ ColorType }) => {
      const t = getChartTheme(isDark);
      chartRef.current?.applyOptions({
        layout: { background: { type: ColorType.Solid, color: t.background }, textColor: t.text },
        grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid, style: 3 } },
        rightPriceScale: { borderColor: t.border },
        timeScale:       { borderColor: t.border },
      });
    });
  }, [isDark]);

  // ── TF switch (Solana + Arc) ───────────────────────────────────────────────
  const switchTf = useCallback(async (tf: Timeframe) => {
    if (!chartRef.current || tfLoading) return;
    setActiveTf(tf);
    activeTfRef.current = tf;
    setTfLoading(true);
    try {
      if (isArc && arcCurveAddress) {
        const [lw, bars] = await Promise.all([
          import("lightweight-charts"),
          fetchArcBars(arcCurveAddress, tf.bucketSec ?? 300),
        ]);
        if (bars.length) await buildSeries(lw, bars, chartTypeRef.current);
      } else if (poolRef.current) {
        const [lw, bars] = await Promise.all([
          import("lightweight-charts"),
          fetchBars(poolRef.current, tf),
        ]);
        if (bars.length) await buildSeries(lw, bars, chartTypeRef.current);
      }
    } catch { /* keep existing */ }
    finally { setTfLoading(false); }
  }, [tfLoading, buildSeries, isArc, arcCurveAddress]);

  // ── Chart type switch (Solana + Arc) ──────────────────────────────────────
  const switchType = useCallback(async (type: ChartType) => {
    if (!chartRef.current) return;
    setChartType(type);
    chartTypeRef.current = type;
    if (liveTimer.current) { clearInterval(liveTimer.current); liveTimer.current = null; }
    setTfLoading(true);
    try {
      if (isArc && arcCurveAddress) {
        const [lw, bars] = await Promise.all([
          import("lightweight-charts"),
          fetchArcBars(arcCurveAddress, activeTfRef.current.bucketSec ?? 300),
        ]);
        if (bars.length) await buildSeries(lw, bars, type);
      } else if (poolRef.current) {
        const [lw, bars] = await Promise.all([
          import("lightweight-charts"),
          fetchBars(poolRef.current, activeTfRef.current),
        ]);
        if (bars.length) await buildSeries(lw, bars, type);
        if (type === "line") {
          liveTimer.current = setInterval(async () => {
            if (!poolRef.current || !seriesRef.current) return;
            try {
              const [lw2, fresh] = await Promise.all([
                import("lightweight-charts"),
                fetchBars(poolRef.current, activeTfRef.current),
              ]);
              await buildSeries(lw2, fresh, "line");
            } catch { /* ignore */ }
          }, LIVE_REFRESH_MS);
        }
      }
    } catch { /* keep existing */ }
    finally { setTfLoading(false); }
  }, [buildSeries, isArc, arcCurveAddress]);

  // ── Shared header ──────────────────────────────────────────────────────────
  const isPositive = (priceChange ?? 0) >= 0;
  const changeColor = isPositive ? "text-emerald-400" : "text-red-400";

  const Header = () => (
    <div className="flex items-start justify-between px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2.5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={ticker ?? name} className="size-7 rounded-full object-cover" />
        ) : (
          <div className="size-7 rounded-full bg-orange-500/80 flex items-center justify-center text-[10px] font-bold text-white">
            {(ticker ?? name).slice(0, 1)}
          </div>
        )}
        <div>
          <p className="text-[13px] font-semibold text-foreground leading-tight">{ticker ?? name}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">{name}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[18px] font-bold text-foreground leading-tight">
          {currentPrice != null ? `$${fmtPrice(currentPrice)}` : "—"}
        </p>
        {priceChange != null && (
          <p className={`text-[12px] font-semibold leading-tight ${changeColor}`}>
            {isPositive ? "↑" : "↓"} {Math.abs(priceChange).toFixed(2)}%
          </p>
        )}
      </div>
    </div>
  );

  // ── Timeframe bar (bottom) ─────────────────────────────────────────────────
  const TfBar = ({
    active,
    onSelect,
    loading = false,
    showType = false,
  }: {
    active: Timeframe;
    onSelect: (tf: Timeframe) => void;
    loading?: boolean;
    showType?: boolean;
  }) => (
    <div className="flex items-center justify-between px-3 py-2 border-t border-border">
      {showType ? (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => switchType("candle")}
            title="Candlestick"
            className={`p-1.5 rounded-lg transition-colors ${
              chartType === "candle"
                ? "bg-white/10 text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CandlestickChart className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => switchType("line")}
            title="Live line"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              chartType === "line"
                ? "bg-emerald-500/20 text-emerald-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="size-3.5" />
            Live
          </button>
        </div>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-0.5">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf.label}
            type="button"
            disabled={loading}
            onClick={() => onSelect(tf)}
            className={`px-2.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
              active.label === tf.label
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tf.label}
          </button>
        ))}
        {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground ml-1" />}
      </div>

      {showType && chartType === "line" && !loading && (
        <div className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-emerald-400 font-medium">Live</span>
        </div>
      )}
    </div>
  );

  // ── DexScreener embed ──────────────────────────────────────────────────────
  if (status === "embed" && dexData) {
    const embedUrl = `https://dexscreener.com/solana/${dexData.pairAddress}?embed=1&loadChartSettings=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=${activeDexTf.dexInterval}`;
    return (
      <div className="rounded-2xl overflow-hidden border border-border bg-card">
        <Header />
        {!embedReady && (
          <div className="flex items-center justify-center" style={{ height: 380 }}>
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <iframe
          key={activeDexTf.label} // remounts on TF change
          src={embedUrl}
          title={`${name} chart`}
          width="100%"
          height="380"
          style={{ border: "none", display: embedReady ? "block" : "none" }}
          onLoad={() => setEmbedReady(true)}
          allow="clipboard-write"
        />
        <TfBar
          active={activeDexTf}
          onSelect={tf => { setActiveDexTf(tf); setEmbedReady(false); }}
        />
      </div>
    );
  }

  // ── GeckoTerminal / loading / error ───────────────────────────────────────
  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card">
      <style>{`.tv-lightweight-charts a[href*="tradingview"]{display:none!important}`}</style>

      <Header />

      {status === "loading" && (
        <div className="flex items-center justify-center" style={{ height: 380 }}>
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center justify-center" style={{ height: 380 }}>
          <p className="text-sm text-muted-foreground">{errorMsg || "No chart data available"}</p>
        </div>
      )}
      {status === "nodata" && (
        <div className="flex items-center justify-center" style={{ height: 380 }}>
          <p className="text-sm text-muted-foreground">No price data yet.</p>
        </div>
      )}

      <div ref={wrapperRef} style={{ display: status === "ready" ? "block" : "none" }} />

      {status === "ready" && (
        <TfBar
          active={activeTf}
          onSelect={switchTf}
          loading={tfLoading}
          showType
        />
      )}
    </div>
  );
}
