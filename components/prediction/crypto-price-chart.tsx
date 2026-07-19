"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer,
} from "recharts";

type Ticker = "BTCUSDT" | "SOLUSDT" | "ETHUSDT";
interface PricePoint { time: number; price: number; open: number; high: number; low: number; }
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

const MAX_POINTS = 60;

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
  const countdown = useCountdown(marketCloseAt);
  const meta = COIN_META[ticker];

  // ── Agrégateur bougie 1s ────────────────────────────────────────────────────
  const candleRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);

  const flushCandle = useCallback(() => {
    const c = candleRef.current;
    if (!c) return;
    candleRef.current = null;
    setCurrentPrice(c.close);
    setPoints(prev => {
      const pt: PricePoint = { time: c.time, price: c.close, open: c.open, high: c.high, low: c.low };
      if (prev.length > 0 && prev[prev.length - 1].time === c.time) {
        const next = [...prev];
        next[next.length - 1] = pt;
        return next;
      }
      const next = [...prev, pt];
      return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
    });
  }, []);

  // Flush une bougie par seconde
  useEffect(() => {
    const id = setInterval(flushCandle, 1000);
    return () => clearInterval(id);
  }, [flushCandle]);

  const pushPrice = useCallback((price: number) => {
    const sec = Math.floor(Date.now() / 1000) * 1000;
    candleRef.current = candleRef.current && candleRef.current.time === sec
      ? { ...candleRef.current, high: Math.max(candleRef.current.high, price), low: Math.min(candleRef.current.low, price), close: price }
      : { time: sec, open: price, high: price, low: price, close: price };
  }, []);

  // ── Chargement initial : klines 1s ─────────────────────────────────────────
  useEffect(() => {
    let settled = false;
    setLoading(true);
    setPoints([]);
    setCurrentPrice(null);

    const applyPoints = (pts: PricePoint[]) => {
      if (pts.length === 0 || settled) return;
      settled = true;
      setPoints(pts.slice(-MAX_POINTS));
      setCurrentPrice(pts[pts.length - 1].price);
      setLoading(false);
    };

    const timeout = setTimeout(() => setLoading(false), 4000);

    fetch(`https://api.binance.com/api/v3/klines?symbol=${ticker}&interval=1s&limit=60`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: [number, string, string, string, string, ...unknown[]][]) => {
        if (Array.isArray(data) && data.length > 0) {
          applyPoints(data.map(k => ({
            time:  k[0] as number,
            price: parseFloat(k[4] as string),
            open:  parseFloat(k[1] as string),
            high:  parseFloat(k[2] as string),
            low:   parseFloat(k[3] as string),
          })));
        } else return Promise.reject();
      })
      .catch(() =>
        fetch(`https://api.binance.com/api/v3/klines?symbol=${ticker}&interval=1m&limit=60`)
          .then(r => r.ok ? r.json() : Promise.reject())
          .then((data: [number, string, string, string, string, ...unknown[]][]) => {
            if (Array.isArray(data) && data.length > 0) {
              applyPoints(data.map(k => ({
                time:  k[0] as number,
                price: parseFloat(k[4] as string),
                open:  parseFloat(k[1] as string),
                high:  parseFloat(k[2] as string),
                low:   parseFloat(k[3] as string),
              })));
            }
          })
          .catch(() => {})
      );

    return () => clearTimeout(timeout);
  }, [ticker]);

  // ── WebSocket Binance aggTrade ──────────────────────────────────────────────
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let wsTimeout: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const stopAll = () => {
      if (wsTimeout) { clearTimeout(wsTimeout); wsTimeout = null; }
      if (ws) { ws.onclose = null; ws.onerror = null; ws.onmessage = null; ws.close(); ws = null; }
      if (pollId) { clearInterval(pollId); pollId = null; }
    };

    const startPolling = () => {
      if (pollId || destroyed) return;
      const poll = async () => {
        try {
          const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${ticker}`);
          if (r.ok) { const d: { price: string } = await r.json(); if (d.price) { pushPrice(parseFloat(d.price)); setLive(true); return; } }
        } catch { /* ignore */ }
        try {
          const r = await fetch(`/api/crypto/price?symbol=${ticker}`);
          const d: { price: string } = await r.json();
          if (d.price) { pushPrice(parseFloat(d.price)); setLive(true); }
        } catch { /* ignore */ }
      };
      void poll();
      pollId = setInterval(poll, 200);
    };

    const startWs = () => {
      if (destroyed) return;
      stopAll();
      let lastMsgAt = Date.now();
      const watchdog = setInterval(() => {
        if (destroyed) { clearInterval(watchdog); return; }
        if (ws && ws.readyState === WebSocket.OPEN && Date.now() - lastMsgAt > 5000) {
          ws.close();
        }
      }, 5000);
      try {
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${ticker.toLowerCase()}@aggTrade`);
        wsTimeout = setTimeout(() => {
          if (ws && ws.readyState !== WebSocket.OPEN) { clearInterval(watchdog); ws.close(); startPolling(); }
        }, 3000);
        ws.onopen = () => { if (wsTimeout) { clearTimeout(wsTimeout); wsTimeout = null; } lastMsgAt = Date.now(); };
        ws.onmessage = (e) => {
          lastMsgAt = Date.now();
          const d = JSON.parse(e.data as string) as { p: string };
          pushPrice(parseFloat(d.p));
          setLive(true);
        };
        ws.onerror = () => { clearInterval(watchdog); ws?.close(); if (!destroyed) startPolling(); };
        ws.onclose = () => { clearInterval(watchdog); if (!destroyed && pollId === null) startPolling(); };
      } catch { startPolling(); }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") startWs();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    startWs();
    return () => {
      destroyed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopAll();
    };
  }, [ticker, pushPrice]);

  const pctFromTarget = currentPrice != null ? ((currentPrice - priceTarget) / priceTarget) * 100 : null;
  const isAbove = pctFromTarget != null && pctFromTarget >= 0;

  const recentPrices = points.slice(-20).map(p => p.price);
  const allPrices = recentPrices.length > 0 ? [...recentPrices, priceTarget] : [priceTarget];
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const spread = maxP - minP;
  const minPad = ticker === "BTCUSDT" ? 0.5 : ticker === "ETHUSDT" ? 0.05 : 0.001;
  const pad = Math.max(minPad, spread * 0.2);
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v: number) => `$${v >= 1000 ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toFixed(3)}`}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine
                y={priceTarget}
                stroke="#60a5fa"
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{ value: `Target $${formatPrice(priceTarget)}`, position: "insideTopRight", fontSize: 8, fill: "#60a5fa" }}
              />
              <Area
                type="linear"
                dataKey="price"
                stroke={lineColor}
                strokeWidth={2}
                fill={`url(#fill-${ticker})`}
                dot={(props: any) => {
                  const { cx, cy, index } = props;
                  if (index !== points.length - 1) return <g key={index} />;
                  return (
                    <g key={index}>
                      <circle cx={cx} cy={cy} r={4} fill={lineColor} stroke="white" strokeWidth={2} />
                    </g>
                  );
                }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
