"use client";

/**
 * TokenChart — Candlestick chart powered by GeckoTerminal (free, no API key)
 * + TradingView Lightweight Charts v5.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Status = "loading" | "nodata" | "error" | "ready";

// ── GeckoTerminal fetcher ─────────────────────────────────────────────────────

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
    .filter(b => b.open > 0 && b.time > 1_000_000_000) // sanity check: valid Unix timestamp
    .reverse(); // oldest-first for the chart
}

async function fetchBars(mintAddress: string): Promise<{ bars: Bar[]; label: string }> {
  // Step 1: get the top pool for this token
  const poolsRes = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mintAddress}/pools?page=1`,
    { headers: { Accept: "application/json" } }
  );
  if (!poolsRes.ok) throw new Error("Aucun pool trouvé");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poolsJson = await poolsRes.json() as any;
  const poolAddress = poolsJson?.data?.[0]?.attributes?.address as string | undefined;
  if (!poolAddress) throw new Error("Pool introuvable");

  // Step 2: try 5m first, fall back to 1h if not enough candles
  const timeframes = [
    { path: "minute?aggregate=5&limit=200", label: "5m" },
    { path: "hour?aggregate=1&limit=200",   label: "1h" },
    { path: "day?aggregate=1&limit=200",    label: "1j" },
  ];

  for (const { path, label } of timeframes) {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/${path}&currency=usd`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const list = json?.data?.attributes?.ohlcv_list as RawList | undefined;
    if (!list?.length) continue;

    const bars = parseOHLCV(list);
    if (bars.length >= 2) return { bars, label };
  }

  throw new Error("Aucune donnée de prix disponible");
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TokenChart({ mintAddress, name }: { mintAddress: string; name: string }) {
  const wrapperRef   = useRef<HTMLDivElement>(null);
  const [status, setStatus]     = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [tfLabel, setTfLabel]   = useState("5m");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!wrapperRef.current) return;

      try {
        const [lw, result] = await Promise.all([
          import("lightweight-charts"),
          fetchBars(mintAddress),
        ]);

        if (cancelled || !wrapperRef.current) return;
        const { bars, label } = result;
        setTfLabel(label);
        if (!bars.length) { setStatus("nodata"); return; }

        const { createChart, CandlestickSeries, ColorType } = lw;

        const chart = createChart(wrapperRef.current, {
          width:  wrapperRef.current.clientWidth,
          height: 420,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "#94a3b8",
          },
          grid: {
            vertLines: { color: "#1e293b" },
            horzLines: { color: "#1e293b" },
          },
          crosshair: { mode: 1 },
          rightPriceScale: { borderColor: "#334155" },
          timeScale:       { borderColor: "#334155", timeVisible: true },
          watermark:       { visible: false },
        });

        const series = chart.addSeries(CandlestickSeries, {
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
        chart.timeScale().fitContent();
        setStatus("ready");

        const ro = new ResizeObserver(() => {
          if (wrapperRef.current) {
            chart.applyOptions({ width: wrapperRef.current.clientWidth });
          }
        });
        ro.observe(wrapperRef.current);

        return () => { chart.remove(); ro.disconnect(); };
      } catch (e) {
        if (!cancelled) {
          console.error("[TokenChart]", e);
          setErrorMsg(e instanceof Error ? e.message : "Graphique indisponible");
          setStatus("error");
        }
      }
    }

    const cleanupPromise = init();
    return () => {
      cancelled = true;
      cleanupPromise.then(fn => fn?.());
    };
  }, [mintAddress]);

  const Fallback = ({ msg }: { msg: string }) => (
    <div className="flex items-center justify-center py-16 px-6">
      <p className="text-sm text-muted-foreground text-center">{msg}</p>
    </div>
  );

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      {/* Hide TradingView attribution logo */}
      <style>{`.tv-lightweight-charts a[href*="tradingview"]{display:none!important}`}</style>

      <div className="flex items-center px-4 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground">{name} · {tfLabel}</span>
      </div>

      {/* Body */}
      {status === "loading" && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {status === "error"  && <Fallback msg={errorMsg} />}
      {status === "nodata" && <Fallback msg="Pas encore de données de prix disponibles." />}

      {/* Chart container — always in DOM so ref works, hidden until ready */}
      <div
        ref={wrapperRef}
        style={{ display: status === "ready" ? "block" : "none" }}
      />
    </div>
  );
}
