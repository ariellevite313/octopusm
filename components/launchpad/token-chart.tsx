"use client";

/**
 * TokenChart — Candlestick chart powered by GeckoTerminal (free, no API key)
 * + TradingView Lightweight Charts.
 *
 * Flow:
 *  1. Fetch top pool for the token from GeckoTerminal
 *  2. Fetch 5-minute OHLCV candles for that pool
 *  3. Render with lightweight-charts
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Status = "loading" | "nodata" | "error" | "ready";

// ── GeckoTerminal fetcher ─────────────────────────────────────────────────────

async function fetchBars(mintAddress: string): Promise<Bar[]> {
  // Step 1: resolve top pool for this token
  const poolsRes = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mintAddress}/pools?page=1`,
    { headers: { Accept: "application/json" }, next: { revalidate: 0 } }
  );
  if (!poolsRes.ok) throw new Error("Aucun pool trouvé sur GeckoTerminal");

  const poolsJson = await poolsRes.json() as {
    data?: { attributes?: { address?: string } }[];
  };
  const poolAddress = poolsJson?.data?.[0]?.attributes?.address;
  if (!poolAddress) throw new Error("Pool introuvable");

  // Step 2: fetch 5-minute OHLCV for the pool (last 200 candles)
  const ohlcvRes = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/minute?aggregate=5&limit=200&currency=usd`,
    { headers: { Accept: "application/json" }, next: { revalidate: 0 } }
  );
  if (!ohlcvRes.ok) throw new Error("Données OHLCV indisponibles");

  const ohlcvJson = await ohlcvRes.json() as {
    data?: { attributes?: { ohlcv_list?: [number, string, string, string, string, string][] } };
  };
  const list = ohlcvJson?.data?.attributes?.ohlcv_list;
  if (!list?.length) throw new Error("Aucune donnée de prix");

  // GeckoTerminal returns newest-first; we need oldest-first for the chart
  return list
    .map(([t, o, h, l, c]) => ({
      time:  t,
      open:  parseFloat(o),
      high:  parseFloat(h),
      low:   parseFloat(l),
      close: parseFloat(c),
    }))
    .filter(b => b.open > 0)
    .reverse();
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  mintAddress: string;
  name: string;
};

export function TokenChart({ mintAddress, name }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus]   = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chartCleanup: (() => void) | undefined;

    async function init() {
      try {
        const [lw, bars] = await Promise.all([
          import("lightweight-charts"),
          fetchBars(mintAddress),
        ]);

        if (cancelled || !containerRef.current) return;
        if (!bars.length) { setStatus("nodata"); return; }

        const { createChart, CandlestickSeries } = lw as typeof import("lightweight-charts");

        const chart = createChart(containerRef.current, {
          width:  containerRef.current.clientWidth,
          height: 420,
          layout: {
            background: { color: "transparent" } as { color: string },
            textColor: "#94a3b8",
          },
          grid: {
            vertLines: { color: "#1e293b" },
            horzLines: { color: "#1e293b" },
          },
          crosshair: { mode: 1 },
          rightPriceScale: { borderColor: "#334155" },
          timeScale:       { borderColor: "#334155", timeVisible: true },
        });

        const series = chart.addSeries(CandlestickSeries, {
          upColor:         "#22c55e",
          downColor:       "#ef4444",
          borderUpColor:   "#22c55e",
          borderDownColor: "#ef4444",
          wickUpColor:     "#22c55e",
          wickDownColor:   "#ef4444",
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (series as any).setData(bars);
        chart.timeScale().fitContent();
        setStatus("ready");

        const ro = new ResizeObserver(() => {
          if (containerRef.current) {
            chart.applyOptions({ width: containerRef.current.clientWidth });
          }
        });
        ro.observe(containerRef.current);

        chartCleanup = () => { chart.remove(); ro.disconnect(); };
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(e instanceof Error ? e.message : "Graphique indisponible");
          setStatus("error");
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
      chartCleanup?.();
    };
  }, [mintAddress]);

  const externalLinks = [
    { label: "GMGN",          href: `https://gmgn.ai/sol/token/${mintAddress}` },
    { label: "GeckoTerminal", href: `https://www.geckoterminal.com/solana/tokens/${mintAddress}` },
    { label: "DexScreener",   href: `https://dexscreener.com/solana/${mintAddress}` },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground">{name} · 5m</span>
        <div className="flex items-center gap-3">
          {externalLinks.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {label} ↗
            </a>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="relative" style={{ minHeight: 420 }}>
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {status === "nodata" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
            <p className="text-sm text-muted-foreground text-center">
              Pas encore de données de prix disponibles.
            </p>
            <div className="flex gap-2">
              {externalLinks.map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70 transition-colors"
                >
                  {label} ↗
                </a>
              ))}
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
            <p className="text-sm text-muted-foreground text-center">{errorMsg}</p>
            <div className="flex gap-2">
              {externalLinks.map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70 transition-colors"
                >
                  {label} ↗
                </a>
              ))}
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          className={status !== "ready" ? "invisible absolute" : ""}
        />
      </div>
    </div>
  );
}
