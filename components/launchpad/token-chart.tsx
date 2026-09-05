"use client";

/**
 * TokenChart — candlestick chart styled like a professional trading UI.
 * Primary: DexScreener embed (indexes Meteora DBC).
 * Fallback: GeckoTerminal OHLCV via lightweight-charts.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { Loader2, CandlestickChart, TrendingUp } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Bar    = { time: number; open: number; high: number; low: number; close: number };
type Status = "loading" | "nodata" | "error" | "ready" | "embed";
type ChartType = "candle" | "line";

type Timeframe = { label: string; gecko: string; dexInterval: number };

const TIMEFRAMES: Timeframe[] = [
  { label: "1m",  gecko: "minute?aggregate=1&limit=200",  dexInterval: 1    },
  { label: "5m",  gecko: "minute?aggregate=5&limit=200",  dexInterval: 5    },
  { label: "15m", gecko: "minute?aggregate=15&limit=200", dexInterval: 15   },
  { label: "1h",  gecko: "hour?aggregate=1&limit=200",    dexInterval: 60   },
  { label: "4h",  gecko: "hour?aggregate=4&limit=200",    dexInterval: 240  },
  { label: "1D",  gecko: "day?aggregate=1&limit=200",     dexInterval: 1440 },
];

const DEFAULT_TF     = TIMEFRAMES[1]; // 5m
const LIVE_REFRESH_MS = 30_000;

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
  mintAddress: string;
  name:        string;
  ticker?:     string;
  logoUrl?:    string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function TokenChart({ mintAddress, name, ticker, logoUrl }: Props) {
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

  // ── Step 1: try DexScreener ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled  = false;
    let geckoClean: (() => void) | undefined;

    async function tryDex() {
      const data = await resolveDex(mintAddress);
      if (cancelled) return;
      if (data) {
        setDexData(data);
        setStatus("embed");
        setCurrentPrice(parseFloat(data.priceUsd));
        setPriceChange(data.priceChange.h24);
      } else {
        geckoClean = initGecko();
      }
    }
    void tryDex();
    return () => { cancelled = true; geckoClean?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintAddress]);

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
            background: { type: ColorType.Solid, color: "#000000" },
            textColor:  "#555555",
          },
          grid: {
            vertLines: { color: "#111111" },
            horzLines: { color: "#111111", style: 3 },
          },
          crosshair: { mode: 1 },
          rightPriceScale: { borderColor: "#1a1a1a" },
          timeScale:       { borderColor: "#1a1a1a", timeVisible: true, secondsVisible: false },
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

  // ── GeckoTerminal theme ────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    import("lightweight-charts").then(({ ColorType }) => {
      chartRef.current?.applyOptions({
        layout: { background: { type: ColorType.Solid, color: "#000000" }, textColor: "#555555" },
        grid: { vertLines: { color: "#111111" }, horzLines: { color: "#111111", style: 3 } },
      });
    });
  }, [isDark]);

  // ── GeckoTerminal TF switch ────────────────────────────────────────────────
  const switchTf = useCallback(async (tf: Timeframe) => {
    if (!poolRef.current || !chartRef.current || tfLoading) return;
    setActiveTf(tf);
    activeTfRef.current = tf;
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

  // ── GeckoTerminal chart type switch ───────────────────────────────────────
  const switchType = useCallback(async (type: ChartType) => {
    if (!poolRef.current || !chartRef.current) return;
    setChartType(type);
    chartTypeRef.current = type;
    if (liveTimer.current) { clearInterval(liveTimer.current); liveTimer.current = null; }
    setTfLoading(true);
    try {
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
    } catch { /* keep existing */ }
    finally { setTfLoading(false); }
  }, [buildSeries]);

  // ── Shared header ──────────────────────────────────────────────────────────
  const isPositive = (priceChange ?? 0) >= 0;
  const changeColor = isPositive ? "text-emerald-400" : "text-red-400";

  const Header = () => (
    <div className="flex items-start justify-between px-4 py-3 border-b border-white/5">
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
          <p className="text-[13px] font-semibold text-white leading-tight">{ticker ?? name}</p>
          <p className="text-[10px] text-white/30 leading-tight">{name}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[18px] font-bold text-white leading-tight">
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
    <div className="flex items-center justify-between px-3 py-2 border-t border-white/5">
      {showType ? (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => switchType("candle")}
            title="Candlestick"
            className={`p-1.5 rounded-lg transition-colors ${
              chartType === "candle"
                ? "bg-white/10 text-white"
                : "text-white/30 hover:text-white/60"
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
                : "text-white/30 hover:text-white/60"
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
                ? "bg-white/15 text-white"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            {tf.label}
          </button>
        ))}
        {loading && <Loader2 className="size-3.5 animate-spin text-white/30 ml-1" />}
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
      <div className="rounded-2xl overflow-hidden border border-white/5 bg-black">
        <Header />
        {!embedReady && (
          <div className="flex items-center justify-center" style={{ height: 380 }}>
            <Loader2 className="size-5 animate-spin text-white/30" />
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
    <div className="rounded-2xl overflow-hidden border border-white/5 bg-black">
      <style>{`.tv-lightweight-charts a[href*="tradingview"]{display:none!important}`}</style>

      <Header />

      {status === "loading" && (
        <div className="flex items-center justify-center" style={{ height: 380 }}>
          <Loader2 className="size-5 animate-spin text-white/30" />
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center justify-center" style={{ height: 380 }}>
          <p className="text-sm text-white/30">{errorMsg || "No chart data available"}</p>
        </div>
      )}
      {status === "nodata" && (
        <div className="flex items-center justify-center" style={{ height: 380 }}>
          <p className="text-sm text-white/30">No price data yet.</p>
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
