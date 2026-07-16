"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart, Area, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer,
} from "recharts";

type Ticker = "BTCUSDT" | "SOLUSDT" | "ETHUSDT";
interface PricePoint { time: number; price: number; }
interface Props {
  ticker: Ticker;
  priceTarget: number;
  marketCloseAt?: string | null;
}

const COIN_META: Record<Ticker, { label: string; symbol: string; color: string }> = {
  BTCUSDT: { label: "Bitcoin",  symbol: "BTC", color: "#f59e0b" },
  SOLUSDT: { label: "Solana",   symbol: "SOL", color: "#9333ea" },
  ETHUSDT: { label: "Ethereum", symbol: "ETH", color: "#3b82f6" },
};

const MAX_POINTS = 120;
const POLL_INTERVAL_MS = 30_000;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 4 });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function useCountdown(closeAt: string | null | undefined) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!closeAt) return;
    const target = new Date(closeAt).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setRemaining("Closed"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setRemaining(`${d}d ${h}h ${m}m`);
      else if (h > 0) setRemaining(`${h}h ${m}m ${s}s`);
      else setRemaining(`${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closeAt]);
  return remaining;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { value: number; payload: PricePoint }[] }) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-mono font-semibold text-foreground">${formatPrice(pt.price)}</p>
      <p className="text-muted-foreground">{formatTime(pt.time)}</p>
    </div>
  );
}

export function CryptoPriceChart({ ticker, priceTarget, marketCloseAt }: Props) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const realtimeActiveRef = useRef(false);
  const countdown = useCountdown(marketCloseAt);
  const meta = COIN_META[ticker];
  const supabaseRef = useRef(getSupabase());

  const pushPoint = (price: number, time: number) => {
    setCurrentPrice(price);
    setPoints((prev) => {
      const next = [...prev, { time, price }];
      return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
    });
  };

  // ── 1. Initial load: klines + Supabase in parallel, first one wins ─────────
  useEffect(() => {
    let settled = false;

    const applyPoints = (pts: PricePoint[]) => {
      if (pts.length === 0) return;
      setPoints(pts);
      setCurrentPrice(pts[pts.length - 1].price);
      setLoading(false);
      settled = true;
    };

    // Fast path: Binance klines via edge proxy (usually <300ms)
    fetch(`/api/crypto/klines?symbol=${ticker}`)
      .then((r) => r.json())
      .then((pts: PricePoint[]) => {
        if (!settled && Array.isArray(pts) && pts.length > 0) applyPoints(pts);
      })
      .catch(() => {});

    // Parallel: Supabase historical data (may have more recent rows)
    supabaseRef.current
      .from("crypto_prices")
      .select("price, recorded_at")
      .eq("symbol", ticker)
      .order("recorded_at", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const pts: PricePoint[] = (data as { price: number; recorded_at: string }[])
            .reverse()
            .map((r) => ({ time: new Date(r.recorded_at).getTime(), price: Number(r.price) }));
          // Always apply Supabase data if it has more recent points
          if (!settled || pts[pts.length - 1].time > (points[points.length - 1]?.time ?? 0)) {
            applyPoints(pts);
          }
        } else if (!settled) {
          setLoading(false);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  // ── 2. Supabase Realtime subscription ─────────────────────────────────────
  useEffect(() => {
    const sb = supabaseRef.current;
    const channel = sb
      .channel(`crypto-prices-${ticker}`)
      .on(
        "postgres_changes" as const,
        { event: "INSERT", schema: "public", table: "crypto_prices", filter: `symbol=eq.${ticker}` },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as { price: number; recorded_at: string };
          realtimeActiveRef.current = true;
          pushPoint(Number(row.price), new Date(row.recorded_at).getTime());
          setLive(true);
        }
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") setLive(true);
      });
    return () => { void sb.removeChannel(channel); };
  }, [ticker]);

  // ── 3. Fallback polling every 30s when Realtime has no data ───────────────
  useEffect(() => {
    let pollId: ReturnType<typeof setInterval> | null = null;
    const poll = async () => {
      if (realtimeActiveRef.current) { if (pollId) clearInterval(pollId); return; }
      try {
        const r = await fetch(`/api/crypto/price?symbol=${ticker}`);
        const d: { price: string } = await r.json();
        if (d.price) { pushPoint(parseFloat(d.price), Date.now()); setLive(true); }
      } catch { /* ignore */ }
    };
    // Start after 35s (give Realtime time to connect)
    const startId = setTimeout(() => {
      poll();
      pollId = setInterval(poll, POLL_INTERVAL_MS);
    }, 35_000);
    return () => { clearTimeout(startId); if (pollId) clearInterval(pollId); };
  }, [ticker]);

  const pctFromTarget =
    currentPrice != null ? ((currentPrice - priceTarget) / priceTarget) * 100 : null;
  const isAbove = pctFromTarget != null && pctFromTarget >= 0;

  const allPrices = points.map((p) => p.price);
  if (priceTarget) allPrices.push(priceTarget);
  const minP = allPrices.length ? Math.min(...allPrices) : 0;
  const maxP = allPrices.length ? Math.max(...allPrices) : 0;
  const pad = (maxP - minP) * 0.1 || priceTarget * 0.005;
  const yDomain: [number, number] = [minP - pad, maxP + pad];
  const lineColor = isAbove ? "#22c55e" : "#ef4444";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div
          className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
          style={{ background: meta.color }}
        >
          {meta.symbol.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">{meta.label} / USDT</p>
          <p className="text-[10px] text-muted-foreground">{meta.symbol}USDT · Binance</p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {countdown && (
            <span className="text-[10px] text-muted-foreground">
              Closes in <span className="font-semibold text-foreground">{countdown}</span>
            </span>
          )}
          <span className={`flex items-center gap-1 text-[10px] font-semibold ${live ? "text-emerald-500" : "text-muted-foreground"}`}>
            <span className={`inline-block size-1.5 rounded-full ${live ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
            {live ? "Live" : "Connecting..."}
          </span>
        </div>
      </div>

      {/* Price + delta */}
      <div className="flex items-baseline gap-3 px-4 pb-3">
        {loading ? (
          <div className="h-8 w-36 animate-pulse rounded-lg bg-muted" />
        ) : (
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {currentPrice != null ? `$${formatPrice(currentPrice)}` : "—"}
          </span>
        )}
        {!loading && pctFromTarget != null && (
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
            isAbove
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
          }`}>
            {isAbove ? "+" : ""}{pctFromTarget.toFixed(2)}% vs target
          </span>
        )}
      </div>

      {/* Target pill */}
      <div className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">Target price</span>
        <span className="text-xs font-semibold text-foreground">${formatPrice(priceTarget)}</span>
        {!loading && (
          <span className={`text-xs font-semibold ${isAbove ? "text-emerald-500" : "text-red-500"}`}>
            {isAbove ? "Above" : "Below"}
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="px-2 pb-4">
        {loading ? (
          <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />
        ) : points.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <span className="text-xs text-muted-foreground">Waiting for first price...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={128}>
            <AreaChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={`fill-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={lineColor} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v: number) =>
                  `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(2)}`
                }
                tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine
                y={priceTarget}
                stroke="#60a5fa"
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{
                  value: `Target $${formatPrice(priceTarget)}`,
                  position: "insideTopRight",
                  fontSize: 8,
                  fill: "#60a5fa",
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={lineColor}
                strokeWidth={1.5}
                fill={`url(#fill-${ticker})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
