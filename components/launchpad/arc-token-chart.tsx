"use client";

/**
 * ArcTokenChart — Price chart for Arc BondingCurve tokens.
 *
 * Source: on-chain Trade events via /api/launchpad/arc-trades
 * Library: recharts (already installed)
 * Display: area price chart + optional buy/sell trade markers
 * Timeframes: ALL / 1H / 6H / 1D
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Trade = {
  timestamp: number;
  isBuy:     boolean;
  usdcAmt:   number;
  tokenAmt:  number;
  price:     number;
  txHash:    string;
};

type Point = {
  time:    number;     // unix seconds
  price:   number;
  isBuy?:  boolean;
};

type TfKey = "ALL" | "1D" | "6H" | "1H";

const TIMEFRAMES: { key: TfKey; label: string; seconds: number }[] = [
  { key: "ALL", label: "ALL", seconds: Infinity  },
  { key: "1D",  label: "1D",  seconds: 86400     },
  { key: "6H",  label: "6H",  seconds: 21600     },
  { key: "1H",  label: "1H",  seconds: 3600      },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  if (!n || n === 0) return "—";
  if (n >= 1)     return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  if (n >= 0.001) return `$${n.toFixed(6)}`;
  return `$${n.toPrecision(4)}`;
}

function fmtTime(unix: number, range: number): string {
  const d = new Date(unix * 1000);
  if (range <= 3600)  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (range <= 86400) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: Point = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-xl border border-border bg-card/90 backdrop-blur px-3 py-2 text-xs shadow-xl space-y-0.5">
      <p className="font-semibold text-foreground">{fmtPrice(d.price)}</p>
      <p className="text-muted-foreground">{new Date(d.time * 1000).toLocaleString()}</p>
      {d.isBuy !== undefined && (
        <p className={d.isBuy ? "text-emerald-400" : "text-red-400"}>
          {d.isBuy ? "▲ Buy" : "▼ Sell"}
        </p>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  curveAddress: string;
  ticker?:      string;
  logoUrl?:     string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ArcTokenChart({ curveAddress, ticker, logoUrl }: Props) {
  const [trades,    setTrades]    = useState<Trade[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [activeTf,  setActiveTf]  = useState<TfKey>("ALL");
  const [showTrades, setShowTrades] = useState(true);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch(`/api/launchpad/arc-trades?curveAddress=${encodeURIComponent(curveAddress)}&limit=500`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json() as { trades?: Trade[]; error?: string };
      if (data.error) throw new Error(data.error);
      setTrades(data.trades ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [curveAddress]);

  useEffect(() => {
    void fetchTrades();
    const id = setInterval(() => void fetchTrades(), 30_000);
    return () => clearInterval(id);
  }, [fetchTrades]);

  // ── Filter by timeframe ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const tf = TIMEFRAMES.find(t => t.key === activeTf)!;
    if (tf.seconds === Infinity) return trades;
    const cutoff = Date.now() / 1000 - tf.seconds;
    return trades.filter(t => t.timestamp >= cutoff);
  }, [trades, activeTf]);

  // ── Build chart data ──────────────────────────────────────────────────────────

  const points: Point[] = useMemo(() =>
    filtered.map(t => ({ time: t.timestamp, price: t.price, isBuy: t.isBuy })),
    [filtered],
  );

  // ── Derived stats ─────────────────────────────────────────────────────────────

  const latestPrice   = points.at(-1)?.price ?? null;
  const firstPrice    = points[0]?.price ?? null;
  const priceChangePct = latestPrice && firstPrice && firstPrice > 0
    ? ((latestPrice - firstPrice) / firstPrice) * 100
    : null;
  const isPositive = priceChangePct !== null ? priceChangePct >= 0 : true;

  const timeRange = filtered.length >= 2
    ? filtered.at(-1)!.timestamp - filtered[0]!.timestamp
    : 3600;

  // Y domain with 10% padding
  const prices  = points.map(p => p.price).filter(Boolean);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 1;
  const pad      = (maxPrice - minPrice) * 0.1 || maxPrice * 0.1;

  const gradId = isPositive ? "arcGreenGrad" : "arcRedGrad";

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Loading chart…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <p className="text-sm text-muted-foreground">Chart unavailable</p>
        <p className="text-[11px] text-muted-foreground/50">{error}</p>
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <p className="text-sm text-muted-foreground">No trades yet — be the first!</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={ticker} className="size-8 rounded-full object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-bold text-foreground tabular-nums">
              {fmtPrice(latestPrice ?? 0)}
            </span>
            {priceChangePct !== null && (
              <span className={`text-sm font-semibold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                {isPositive ? "+" : ""}{priceChangePct.toFixed(2)}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{ticker ?? "Token"} · Arc Testnet · {points.length} trades</p>
        </div>

        {/* Timeframe pills */}
        <div className="flex gap-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.key}
              onClick={() => setActiveTf(tf.key)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                activeTf === tf.key
                  ? "bg-orange-500 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="px-1 pb-2">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="arcGreenGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="arcRedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0}   />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="time"
              tickFormatter={t => fmtTime(t as number, timeRange)}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              minTickGap={60}
            />
            <YAxis
              domain={[Math.max(0, minPrice - pad), maxPrice + pad]}
              tickFormatter={v => fmtPrice(v as number)}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip content={<ChartTooltip />} />

            <Area
              type="monotone"
              dataKey="price"
              stroke={isPositive ? "#10b981" : "#ef4444"}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 4, fill: isPositive ? "#10b981" : "#ef4444", strokeWidth: 0 }}
              isAnimationActive={false}
            />

            {/* Buy / sell dots */}
            {showTrades && points.map((p, i) =>
              p.isBuy !== undefined ? (
                <ReferenceDot
                  key={i}
                  x={p.time}
                  y={p.price}
                  r={3}
                  fill={p.isBuy ? "#10b981" : "#ef4444"}
                  stroke="none"
                />
              ) : null,
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Footer ── */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <button
          onClick={() => setShowTrades(s => !s)}
          className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
            showTrades
              ? "border-orange-500/40 text-orange-400"
              : "border-border text-muted-foreground"
          }`}
        >
          {showTrades ? "● Trades on" : "○ Trades off"}
        </button>
        <span className="text-[10px] text-muted-foreground/40">On-chain · Arc Testnet</span>
      </div>
    </div>
  );
}
