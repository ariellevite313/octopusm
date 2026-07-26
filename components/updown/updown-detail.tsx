"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Clock, ArrowLeft, Loader2 } from "lucide-react";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Customized,
} from "recharts";
import { useAuth } from "@/providers/auth-provider";
import { connectWalletAndAuth } from "@/lib/wallet/auth";
import { getAvailableWallets } from "@/lib/wallet/adapters";
import { WalletSelectDialog } from "@/components/wallet/wallet-select-dialog";
import { CommentsSection } from "@/components/shared/comments-section";
import { TREASURY_ADDRESS, USDC_MINT } from "@/lib/market/betting";
import type { WalletType } from "@/lib/wallet/adapters";

interface UpDownMarket {
  id: string; symbol: string; duration_min: number; strike_price: number;
  opens_at: string; closes_at: string; resolve_at: string | null;
  status: "open" | "resolved" | "cancelled";
  outcome: "up" | "down" | null; pool_up: number; pool_down: number;
  fee_rate: number; open_price: number | null;
}

interface UpDownBet {
  id: string; market_id: string; direction: "up" | "down";
  amount: number; payout: number | null; status: string;
}

interface PricePoint { time: number; price: number; open: number; high: number; low: number; }

const COIN_META: Record<string, { label: string; symbol: string; color: string; img: string }> = {
  BTCUSDT: { label: "Bitcoin",  symbol: "BTC", color: "#f59e0b", img: "/bitcoin.png" },
  ETHUSDT: { label: "Ethereum", symbol: "ETH", color: "#3b82f6", img: "/ethereum.png" },
  SOLUSDT: { label: "Solana",   symbol: "SOL", color: "#9333ea", img: "/solana.png" },
};

const QUICK_AMOUNTS = [5, 25, 100, 500];
const MIN_AMOUNT = 2;
const MAX_POINTS = 60;
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
  return new Date(ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function useCountdown(closeAt: string | null | undefined): string {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!closeAt) return;
    const target = new Date(closeAt).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setRemaining("Termine"); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 500);
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

const LiveChart = memo(function LiveChart({ ticker, strikePrice, durationMin, opensAt, resolveAt, marketStatus, liveCountdown }: { ticker: string; strikePrice: number; durationMin: number; opensAt: string; resolveAt: string | null; marketStatus: string; liveCountdown: string; }) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [smoothData, setSmoothData] = useState<PricePoint[]>([]); // ~12fps chart data
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Scrolling X-axis : fenêtre glissante de 60s ──────────────────────────
  // xNow est recalculé à chaque render (déclenché par setSmoothData ~12fps via RAF)
  // → pas besoin de setInterval séparé, le scroll est fluide à ~80ms.
  const WINDOW_MS = 60_000;
  const xNow = Date.now();
  const supabaseRef = useRef(getSupabase());
  const meta = COIN_META[ticker] ?? { label: ticker, symbol: ticker, color: "#888", img: "" };

  // ── Smooth animation refs (no setState = no re-render overhead) ──────────
  const displayPriceRef  = useRef<HTMLSpanElement>(null); // direct DOM update 60fps
  const targetPriceRef   = useRef<number | null>(null);   // latest real price
  const prevRealRef      = useRef<{ price: number; ts: number } | null>(null);
  const pointsRef        = useRef<PricePoint[]>([]);       // mirror for RAF access
  const noiseRef         = useRef(0);
  const rafIdRef         = useRef<number | null>(null);
  const lastChartTickRef = useRef(0);
  // Accumulates noisy 80ms chart points — never rebuilt from hist (avoids straight segments)
  const smoothDataRef    = useRef<PricePoint[]>([]);

  // Sync pointsRef with points state so RAF can read without stale closure
  useEffect(() => { pointsRef.current = points; }, [points]);

  // ── RAF: smooth 60fps price + ~12fps chart update ───────────────────────
  useEffect(() => {
    const INTERP_MS     = 200;  // interpolation window per real WS tick
    const CHART_TICK_MS = 80;   // ~12fps chart refresh
    const MAX_SMOOTH    = 1500; // ~2min of 80ms points

    const tick = () => {
      const now    = Date.now();
      const target = targetPriceRef.current;

      if (target != null) {
        // ── Base: ease-in-out interpolation between real WS ticks ──────────
        let base = target;
        const prev = prevRealRef.current;
        if (prev && now - prev.ts < INTERP_MS) {
          const t     = Math.max(0, Math.min(1, (now - prev.ts) / INTERP_MS));
          const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          base = prev.price + (target - prev.price) * eased;
        }

        // ── Ornstein-Uhlenbeck micro-noise ──────────────────────────────────
        // X(t+dt) = X(t)*(1 - θ/fps) + σ*ε
        // θ = 3.0  → half-life ~0.23s  (fast reversion = no drift)
        // σ = 0.000015*price/frame → ~$2 std-dev on BTC in steady state
        // Occasional spike (3%/frame) simulates a larger trade hitting the book.
        const OU_THETA = 1.5;
        const sigma    = target * 0.00004;
        noiseRef.current = noiseRef.current * (1 - OU_THETA / 60)
                         + sigma * (Math.random() - 0.5) * 2;
        if (Math.random() < 0.07) {
          noiseRef.current += sigma * (Math.random() - 0.5) * 6; // micro-spike
        }
        const noiseCap = target * 0.0002; // hard cap ±0.02% (±$12.8 BTC)
        noiseRef.current = Math.max(-noiseCap, Math.min(noiseCap, noiseRef.current));

        const smooth = base + noiseRef.current;

        // ── 60fps: update display span (no React re-render) ────────────────
        if (displayPriceRef.current) {
          displayPriceRef.current.textContent = `$${formatPrice(smooth)}`;
        }

        // ── ~12fps: accumulate noisy points into smoothDataRef ─────────────
        // Never rebuild from hist — avoids straight segments between WS ticks.
        if (now - lastChartTickRef.current > CHART_TICK_MS) {
          lastChartTickRef.current = now;
          const hasSeed = smoothDataRef.current.length > 0 || pointsRef.current.length > 0;
          if (hasSeed) {
            if (smoothDataRef.current.length === 0) {
              // First live tick: seed from real candles then append
              smoothDataRef.current = [...pointsRef.current];
            }
            const pt: PricePoint = { time: now, price: smooth, open: smooth, high: smooth, low: smooth };
            const next = [...smoothDataRef.current, pt];
            smoothDataRef.current = next.length > MAX_SMOOTH ? next.slice(-MAX_SMOOTH) : next;
            setSmoothData(smoothDataRef.current);
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current != null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    };
  }, []); // mount once — reads latest values via refs

  // Countdown unique vers resolve_at (modèle Limitless : fenêtre unifiée)
  const liveCountdownChart = useCountdown(marketStatus === "open" ? resolveAt : null);

  // Format opensAt as a readable date+time
  const opensAtFormatted = (() => {
    try {
      const d = new Date(opensAt);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " +
        d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch { return opensAt; }
  })();

  // Agrégateur de bougie 1s — accumule les trades et flush une fois par seconde
  const candleRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);

  const flushCandle = useCallback(() => {
    const c = candleRef.current;
    if (!c) return;
    candleRef.current = null;
    setCurrentPrice(c.close);
    setPoints(prev => {
      const pt: PricePoint = { time: c.time, price: c.close, open: c.open, high: c.high, low: c.low };
      // Met à jour la bougie courante si même seconde, sinon ajoute
      if (prev.length > 0 && prev[prev.length - 1].time === c.time) {
        const next = [...prev];
        next[next.length - 1] = pt;
        return next;
      }
      const next = [...prev, pt];
      return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
    });
  }, []);

  // Tick 1s — flush la bougie en cours toutes les secondes
  useEffect(() => {
    const id = setInterval(flushCandle, 1000);
    return () => clearInterval(id);
  }, [flushCandle]);

  // Reçoit un prix brut — met à jour les refs d'interpolation + agrège la bougie
  const pushPrice = useCallback((price: number) => {
    // Track previous real price for smooth interpolation in RAF
    if (targetPriceRef.current != null) {
      prevRealRef.current = { price: targetPriceRef.current, ts: Date.now() };
    }
    targetPriceRef.current = price;
    setCurrentPrice(price);

    // Aggregate into 1-second candle (existing behavior)
    const sec = Math.floor(Date.now() / 1000) * 1000;
    candleRef.current = candleRef.current && candleRef.current.time === sec
      ? { ...candleRef.current, high: Math.max(candleRef.current.high, price), low: Math.min(candleRef.current.low, price), close: price }
      : { time: sec, open: price, high: price, low: price, close: price };
  }, []);

  useEffect(() => {
    setLoading(true);
    setPoints([]);
    setCurrentPrice(null);
    let resolved = false;

    const applyPoints = (pts: PricePoint[]) => {
      if (pts.length === 0 || resolved) return;
      const sliced = pts.slice(-MAX_POINTS);
      const lastPrice = sliced[sliced.length - 1].price;
      setPoints(sliced);
      setSmoothData(sliced);
      pointsRef.current    = sliced;
      smoothDataRef.current = [...sliced]; // seed noisy accumulator from real candles
      setCurrentPrice(lastPrice);
      // Seed RAF refs so animation starts immediately without waiting for WS
      targetPriceRef.current = lastPrice;
      setLoading(false);
      resolved = true;
    };

    // Timeout securite: 4s max puis on cache le loading
    const timeout = setTimeout(() => setLoading(false), 4000);

    // Pour un marché terminé, on charge les klines de la période du round (opensAt → resolveAt).
    // Pour un marché en cours, on charge les 60 dernières bougies 1s.
    const marketDone = marketStatus === "resolved" || marketStatus === "cancelled" ||
      (resolveAt != null && Date.now() >= new Date(resolveAt).getTime());

    let klinesUrl: string;
    if (marketDone && resolveAt) {
      const startMs = new Date(opensAt).getTime();
      const endMs   = new Date(resolveAt).getTime();
      // Choisir l'intervalle selon la durée totale du round
      const durationMs = endMs - startMs;
      const interval   = durationMs <= 5 * 60_000 ? "1s" : durationMs <= 30 * 60_000 ? "1m" : "5m";
      klinesUrl = `https://api.binance.com/api/v3/klines?symbol=${ticker}&interval=${interval}&startTime=${startMs}&endTime=${endMs}&limit=120`;
    } else {
      klinesUrl = `https://api.binance.com/api/v3/klines?symbol=${ticker}&interval=1s&limit=60`;
    }

    fetch(klinesUrl)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: [number, string, string, string, string, ...unknown[]][]) => {
        if (Array.isArray(data) && data.length > 0) {
          applyPoints(data.map(k => ({
            time: k[0] as number,
            price: parseFloat(k[4] as string),
            open:  parseFloat(k[1] as string),
            high:  parseFloat(k[2] as string),
            low:   parseFloat(k[3] as string),
          })));
        } else return Promise.reject();
      })
      .catch(() => {
        // Fallback: proxy serveur 1s — garde la même fenêtre (60 secondes) pour
        // que $1 reste visible. NE PAS utiliser interval=1m (60 points = 60 min → $1 invisible).
        fetch(`/api/crypto/klines?symbol=${ticker}&interval=1s&limit=60`)
          .then(r => r.ok ? r.json() : Promise.reject())
          .then((data: { time: number; price: number; open: number; high: number; low: number }[]) => {
            if (Array.isArray(data) && data.length > 0) applyPoints(data);
          })
          .catch(() => {});
      });

    return () => clearTimeout(timeout);
  }, [ticker, marketStatus, opensAt, resolveAt]);

  // Marché terminé = résolu ou annulé, OU resolve_at dépassé
  const isMarketOver = marketStatus === "resolved" || marketStatus === "cancelled" ||
    (resolveAt != null && Date.now() >= new Date(resolveAt).getTime());

  // WebSocket Binance — actif seulement pendant la durée du round (jusqu'à resolve_at).
  // Si le marché est déjà terminé au montage, on ne connecte rien.
  useEffect(() => {
    // Ne pas ouvrir le WS/poll si le marché est déjà fini
    if (isMarketOver) {
      setLive(false);
      setLoading(false);
      return;
    }

    let ws: WebSocket | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let wsTimeout: ReturnType<typeof setTimeout> | null = null;
    let watchdogId: ReturnType<typeof setInterval> | null = null;
    let destroyed = false;

    const stopAll = () => {
      if (wsTimeout) { clearTimeout(wsTimeout); wsTimeout = null; }
      if (watchdogId) { clearInterval(watchdogId); watchdogId = null; }
      if (ws) { ws.onclose = null; ws.onerror = null; ws.onmessage = null; ws.close(); ws = null; }
      if (pollId) { clearInterval(pollId); pollId = null; }
      setLive(false);
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
      pollId = setInterval(poll, 2000);
    };

    const startWs = () => {
      if (destroyed) return;
      stopAll(); // also clears any existing watchdogId
      setLive(false);
      let lastMsgAt = Date.now();
      watchdogId = setInterval(() => {
        if (destroyed) { clearInterval(watchdogId!); watchdogId = null; return; }
        if (ws && ws.readyState === WebSocket.OPEN && Date.now() - lastMsgAt > 5000) {
          ws.close();
        }
      }, 5000);
      try {
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${ticker.toLowerCase()}@aggTrade`);
        wsTimeout = setTimeout(() => {
          if (ws && ws.readyState !== WebSocket.OPEN) {
            if (watchdogId) { clearInterval(watchdogId); watchdogId = null; }
            ws.close(); startPolling();
          }
        }, 3000);
        ws.onopen = () => { if (wsTimeout) { clearTimeout(wsTimeout); wsTimeout = null; } lastMsgAt = Date.now(); };
        ws.onmessage = (e) => {
          lastMsgAt = Date.now();
          const d = JSON.parse(e.data as string) as { p: string; T: number };
          pushPrice(parseFloat(d.p));
          setLive(true);
        };
        ws.onerror = () => {
          if (watchdogId) { clearInterval(watchdogId); watchdogId = null; }
          ws?.close(); if (!destroyed) startPolling();
        };
        ws.onclose = () => {
          if (watchdogId) { clearInterval(watchdogId); watchdogId = null; }
          if (!destroyed && pollId === null) startPolling();
        };
      } catch {
        if (watchdogId) { clearInterval(watchdogId); watchdogId = null; }
        startPolling();
      }
    };

    // Arrêt automatique à resolve_at — coupe proprement le WS quand le round se termine
    let resolveTimer: ReturnType<typeof setTimeout> | null = null;
    if (resolveAt) {
      const msUntilResolve = new Date(resolveAt).getTime() - Date.now();
      if (msUntilResolve > 0) {
        resolveTimer = setTimeout(() => {
          destroyed = true;
          document.removeEventListener("visibilitychange", onVisibilityChange);
          stopAll();
        }, msUntilResolve);
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !destroyed) startWs();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    startWs();
    return () => {
      destroyed = true;
      if (resolveTimer) clearTimeout(resolveTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopAll();
    };
  }, [ticker, pushPrice, isMarketOver, resolveAt]);

  const isAbove = currentPrice != null && currentPrice >= strikePrice;

  // ── Domaine Y tight sur la fenêtre visible (60s) uniquement ──────────────
  // On filtre sur les points dans [xNow - WINDOW_MS, xNow] pour que le zoom
  // Y suive la fenêtre scrollante et amplify les micro-variations visibles.
  const visiblePrices = smoothData
    .filter(p => p.time >= xNow - WINDOW_MS && p.time <= xNow)
    .map(p => p.price);
  const refPrice = currentPrice ?? strikePrice;
  const minSpread = refPrice * 0.0005; // 0.05% → ~$32 BTC, ~$1.2 ETH, ~$0.07 SOL
  const priceValues = visiblePrices.length > 0 ? visiblePrices : [strikePrice];
  const minP  = Math.min(...priceValues);
  const maxP  = Math.max(...priceValues);
  const spread = maxP - minP;
  const effectiveSpread = Math.max(spread, minSpread);
  const pad = effectiveSpread * 0.25; // 25% de padding vertical
  const yMin = minP - pad;
  const yMax = maxP + pad;
  const yDomain: [number, number] = [yMin, yMax];

  // ── Smart target: visibilité + opacité de la ligne ──────────────────────
  const strikeAboveDomain = strikePrice > yMax;
  const strikeBelowDomain = strikePrice < yMin;
  const strikeInDomain    = !strikeAboveDomain && !strikeBelowDomain;
  // Fade la ligne quand le prix est très proche du target (8% du range visible)
  const distToStrike    = currentPrice != null ? Math.abs(currentPrice - strikePrice) : Infinity;
  const fadeZone        = effectiveSpread * 0.08;
  const strikeLineOpacity = strikeInDomain
    ? Math.min(1, distToStrike / Math.max(fadeZone, 0.01))
    : 0;

  const lineColor = isAbove ? "#22c55e" : "#ef4444";
  const pctDiff = currentPrice != null ? ((currentPrice - strikePrice) / strikePrice) * 100 : null;

  return (
    <div className="rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        {meta.img
          ? <Image src={meta.img} alt={meta.symbol} width={32} height={32} className="rounded-full bg-white p-0.5 shrink-0" />
          : <div className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white shrink-0" style={{ background: meta.color }}>{meta.symbol[0]}</div>
        }
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">{meta.label} Up or Down {durationMin}m</p>
          <p className="text-[10px] text-muted-foreground">{opensAtFormatted}</p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {marketStatus === "open" ? (
            <>
              {liveCountdownChart === "Termine" ? (
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  <Loader2 className="size-2.5 animate-spin" />
                  Resolving
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                  <span className="text-[10px] tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{liveCountdownChart}</span>
                </>
              )}
            </>
          ) : (
            <span className={`flex items-center gap-1 text-[10px] font-semibold ${live ? "text-emerald-500" : "text-muted-foreground"}`}>
              <span className={`inline-block size-1.5 rounded-full ${live ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
              {live ? "Live" : "Connecting..."}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-3 px-4 pb-3">
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {/* ref updated at 60fps via RAF without React re-render */}
          <span ref={displayPriceRef}>
            {currentPrice != null ? `$${formatPrice(currentPrice)}` : "—"}
          </span>
        </span>
        {pctDiff != null && (
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
            isAbove
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
          }`}>
            {isAbove ? "+" : ""}{pctDiff.toFixed(3)}% vs strike
          </span>
        )}
      </div>

      <div className="mx-4 mb-1 flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">Strike price</span>
        <span className="text-xs font-semibold text-foreground">${formatPrice(strikePrice)}</span>
        <span className={`text-xs font-semibold ${isAbove ? "text-emerald-500" : "text-red-500"}`}>
          {isAbove ? "Above ↑" : "Below ↓"}
        </span>
      </div>
      {/* S-05: informer que la résolution utilise le close klines 1min, pas le prix live */}
      <p className="mx-4 mb-3 text-[10px] text-muted-foreground">
        📌 The live price (chart) is indicative. Resolution uses the <strong>Binance 1min close</strong> at the end of the round.
      </p>

      <div className="px-2 pb-4">
        {loading || points.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <span className="text-xs text-muted-foreground animate-pulse">
              {loading ? "Loading price data..." : "Waiting for first price..."}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={smoothData.length > 0 ? smoothData : points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`fill-updown-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={lineColor} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={lineColor} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={[xNow - WINDOW_MS, xNow]}
                tickFormatter={formatTime}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false} axisLine={false}
                tickCount={6}
              />
              <YAxis
                domain={yDomain}
                orientation="right"
                tickFormatter={(v: number) => {
                  if (v >= 10_000) return `$${Math.round(v).toLocaleString("en-US")}`;
                  if (v >= 1_000) return `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`;
                  if (v >= 100)   return `$${v.toFixed(2)}`;
                  if (v >= 10)    return `$${v.toFixed(3)}`;
                  return `$${v.toFixed(4)}`;
                }}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={68}
                tickCount={10}
              />
              <Tooltip content={<ChartTooltip />} />

              {/* ── Smart Target: ligne qui fade + label permanent ── */}
              <Customized component={(p: any) => {
                const yAxis = p.yAxisMap?.[0];
                if (!yAxis?.scale) return null;
                const { height: h, width: w, margin: m } = p;
                const mt = (m?.top  ?? 8);
                const mb = (m?.bottom ?? 0);
                const plotBottom = h - mb;

                // Position pixel du strike
                const rawY = yAxis.scale(strikePrice);
                const isAboveView = rawY < mt;
                const isBelowView = rawY > plotBottom;
                const inView = !isAboveView && !isBelowView;

                // Label clampé dans les bornes du graphique
                const labelY = Math.max(mt + 10, Math.min(plotBottom - 10, rawY));

                // Arrow si hors vue
                const arrow = isAboveView ? ' ↑' : isBelowView ? ' ↓' : '';
                const labelText = `$${formatPrice(strikePrice)}${arrow}`;

                // X de début de l'axe Y (plot area se termine là)
                const yAxisX = yAxis.x ?? (w - (yAxis.width ?? 68));
                const labelW = 66;

                return (
                  <g>
                    {/* Ligne de target — fade quand prix proche, invisible si hors vue */}
                    {inView && (
                      <line
                        x1={m?.left ?? 0}
                        y1={rawY}
                        x2={yAxisX}
                        y2={rawY}
                        stroke="#60a5fa"
                        strokeDasharray="5 3"
                        strokeWidth={1.5}
                        style={{ opacity: strikeLineOpacity, transition: 'opacity 0.5s ease' }}
                      />
                    )}
                    {/* Label target — toujours visible, se déplace avec transition */}
                    <g style={{ transform: `translateY(${labelY}px)`, transition: 'transform 0.3s ease' }}>
                      <rect
                        x={yAxisX}
                        y={-9}
                        width={labelW}
                        height={18}
                        rx={3}
                        fill="#3b82f6"
                        fillOpacity={0.9}
                      />
                      <text
                        x={yAxisX + labelW / 2}
                        y={4.5}
                        textAnchor="middle"
                        fill="white"
                        fontSize={9}
                        fontWeight="bold"
                        fontFamily="ui-monospace, SFMono-Regular, monospace"
                      >
                        {labelText}
                      </text>
                    </g>
                  </g>
                );
              }} />

              <Area type="monotoneX" dataKey="price" stroke={lineColor} strokeWidth={2}
                fill={`url(#fill-updown-${ticker})`}
                dot={(props: any) => {
                  const { cx, cy, index } = props;
                  const data = smoothData.length > 0 ? smoothData : points;
                  if (index !== data.length - 1) return <g key={index} />;
                  return (
                    <g key={index}>
                      <circle cx={cx} cy={cy} r={5} fill={lineColor} stroke="white" strokeWidth={2} />
                    </g>
                  );
                }}
                isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
});

export function UpDownDetail({ marketId }: { marketId: string }) {
  const router = useRouter();
  const { walletAddress, walletType } = useAuth();
  const [market, setMarket] = useState<UpDownMarket | null>(null);
  const [myBets, setMyBets] = useState<UpDownBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [activeDir, setActiveDir] = useState<"up" | "down" | null>(null);
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const supabase = useRef(getSupabase());
  const walletAddressRef = useRef(walletAddress);
  useEffect(() => { walletAddressRef.current = walletAddress; }, [walletAddress]);

  // Modèle Limitless : une seule fenêtre, countdown unique vers resolve_at
  const resolveTarget = market
    ? market.resolve_at
      ?? new Date(
           new Date(market.opens_at).getTime() +
           market.duration_min * 60_000
         ).toISOString()
    : null;

  const liveCountdown = useCountdown(market?.status === "open" ? resolveTarget : null);

  const fetchMarket = useCallback(async () => {
    const { data } = await supabase.current.from("updown_markets").select("*").eq("id", marketId).single();
    if (data) setMarket(data as UpDownMarket);
    setLoading(false);
  }, [marketId]);

  const fetchMyBets = useCallback(async (walletAddr?: string) => {
    const addr = walletAddr ?? walletAddress;
    if (!addr) return;
    try {
      const res = await fetch(
        `/api/updown/my-bet?market_id=${encodeURIComponent(marketId)}`
      );
      if (!res.ok) return;
      const data = await res.json() as { bets?: UpDownBet[]; bet?: UpDownBet | null };
      // Support both old (bet) and new (bets) response shapes
      if (Array.isArray(data.bets)) {
        setMyBets(data.bets);
      } else if (data.bet) {
        setMyBets([data.bet]);
      } else {
        setMyBets([]);
      }
    } catch { /* ignore */ }
  }, [marketId, walletAddress]);

  useEffect(() => { void fetchMarket(); void fetchMyBets(); }, [fetchMarket, fetchMyBets]);

  useEffect(() => {
    const id = setInterval(() => {
      void fetchMarket();
      void fetchMyBets();
    }, 10_000);
    return () => clearInterval(id);
  }, [fetchMarket, fetchMyBets]);

  useEffect(() => {
    const sb = supabase.current;
    const ch = sb
      .channel(`updown-detail-${marketId}`)
      .on("postgres_changes" as const, {
        event: "UPDATE", schema: "public", table: "updown_markets",
        filter: `id=eq.${marketId}`,
      }, () => {
        void fetchMarket();
        void fetchMyBets(walletAddressRef.current ?? undefined);
      })
      .on("postgres_changes" as const, {
        event: "UPDATE", schema: "public", table: "updown_bets",
      }, (payload: { new: { market_id?: string } }) => {
        if (payload.new?.market_id === marketId) {
          void fetchMyBets(walletAddressRef.current ?? undefined);
        }
      })
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [marketId, fetchMarket, fetchMyBets]);

  const handleBet = async (dir: "up" | "down") => {
    if (!walletAddress || !walletType) { setShowWalletDialog(true); return; }
    if (amount < MIN_AMOUNT) { toast.error(`Minimum $${MIN_AMOUNT} USDC`); return; }
    if (!market) return;

    setSubmitting(true);
    setActiveDir(dir);
    try {
      const web3 = await import("@solana/web3.js");
      const { Connection, PublicKey, Transaction, TransactionInstruction } = web3;
      const adapters = await import("@/lib/wallet/adapters");
      let provider = adapters.getProviderByType(walletType);
      if (!provider && typeof window !== "undefined") {
        const w = window as any;
        if (w.solana?.signAndSendTransaction || w.solana?.signTransaction) provider = w.solana;
      }
      if (!provider) { toast.error("Wallet not found"); return; }

      const TOKEN_PROGRAM    = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
      const ASSOC_TOKEN_PROG = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
      const MEMO_PROGRAM     = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
      const amountBase = Math.round(amount * 1_000_000);

      const payerPK     = new PublicKey(walletAddress);
      const recipientPK = new PublicKey(TREASURY_ADDRESS);
      const mintPK      = new PublicKey(USDC_MINT);
      const payerATA    = PublicKey.findProgramAddressSync(
        [payerPK.toBuffer(), new PublicKey(TOKEN_PROGRAM).toBuffer(), mintPK.toBuffer()],
        new PublicKey(ASSOC_TOKEN_PROG)
      )[0];
      const recipATA = PublicKey.findProgramAddressSync(
        [recipientPK.toBuffer(), new PublicKey(TOKEN_PROGRAM).toBuffer(), mintPK.toBuffer()],
        new PublicKey(ASSOC_TOKEN_PROG)
      )[0];
      const memo = `updown?market=${market.id}&dir=${dir}&wallet=${walletAddress}`;

      const RPCS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com", "https://rpc.ankr.com/solana"];
      let signature = "";
      for (const rpc of RPCS) {
        try {
          const conn = new Connection(rpc, "confirmed");
          const { blockhash } = await conn.getLatestBlockhash("confirmed");
          const tx = new Transaction({ feePayer: payerPK, recentBlockhash: blockhash });
          const ataInfo = await conn.getAccountInfo(recipATA, "confirmed");
          if (!ataInfo) {
            tx.add(new TransactionInstruction({
              programId: new PublicKey(ASSOC_TOKEN_PROG),
              keys: [
                { pubkey: payerPK,                      isSigner: true,  isWritable: true  },
                { pubkey: recipATA,                     isSigner: false, isWritable: true  },
                { pubkey: recipientPK,                  isSigner: false, isWritable: false },
                { pubkey: mintPK,                       isSigner: false, isWritable: false },
                { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: new PublicKey(TOKEN_PROGRAM), isSigner: false, isWritable: false },
              ],
              data: Buffer.from([1]),
            }));
          }
          tx.add(new TransactionInstruction({
            programId: new PublicKey(MEMO_PROGRAM),
            keys: [{ pubkey: payerPK, isSigner: true, isWritable: false }],
            data: Buffer.from(memo, "utf8"),
          }));
          const txData = Buffer.alloc(10);
          txData[0] = 12;
          let v = amountBase;
          for (let i = 0; i < 8; i++) { txData[1 + i] = v & 0xff; v = Math.floor(v / 256); }
          txData[9] = 6;
          tx.add(new TransactionInstruction({
            programId: new PublicKey(TOKEN_PROGRAM),
            keys: [
              { pubkey: payerATA, isSigner: false, isWritable: true  },
              { pubkey: mintPK,   isSigner: false, isWritable: false },
              { pubkey: recipATA, isSigner: false, isWritable: true  },
              { pubkey: payerPK,  isSigner: true,  isWritable: false },
            ],
            data: txData,
          }));
          if (provider.signAndSendTransaction) {
            const res = await provider.signAndSendTransaction(tx, { maxRetries: 3 });
            signature = res.signature;
          } else {
            const signed = await provider.signTransaction!(tx);
            signature = await conn.sendRawTransaction((signed as any).serialize(), { maxRetries: 3 });
          }
          break;
        } catch { /* try next RPC */ }
      }

      if (!signature) { toast.error("Transaction failed"); return; }

      const res = await fetch("/api/updown/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market_id: market.id, wallet_address: walletAddress, direction: dir, amount, tx_signature: signature }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast.error(err.error ?? "Server error");
        return;
      }
      toast.success(`${dir.toUpperCase()} predict placed!`);
      void fetchMyBets();
      void fetchMarket();
    } catch (e: any) {
      const msg = (e?.message ?? "").toLowerCase();
      if (msg.includes("cancel") || msg.includes("reject")) toast.error("Transaction cancelled");
      else toast.error("Error: " + (e?.message ?? ""));
    } finally {
      setSubmitting(false);
      setActiveDir(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!market) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Market not found.</div>;
  }

  const isOpen      = market.status === "open";
  const isResolved  = market.status === "resolved";
  const totalPool  = (market.pool_up ?? 0) + (market.pool_down ?? 0);
  const meta       = COIN_META[market.symbol] ?? { label: market.symbol, symbol: market.symbol, color: "#888", img: "" };

  // Paris du round actuel uniquement
  const currentRoundBets = myBets.filter(b => b.market_id === marketId);

  function estPayout(dir: "up" | "down"): number {
    const myPool = dir === "up" ? (market!.pool_up ?? 0) : (market!.pool_down ?? 0);
    const oppPool = dir === "up" ? (market!.pool_down ?? 0) : (market!.pool_up ?? 0);
    // fee_rate est stocké en pourcentage (ex: 5 = 5%) → diviser par 100
    const feeRate = (market!.fee_rate ?? 5) / 100;
    if (myPool + amount <= 0) return amount;
    return amount + (amount / (myPool + amount)) * oppPool * (1 - feeRate);
  }

  // Pool bar percentages
  const upPct   = totalPool > 0 ? Math.round(((market.pool_up ?? 0) / totalPool) * 100) : 50;
  const downPct = 100 - upPct;

  return (
    <div className="min-h-screen bg-background">
      {/* Main 2-col layout */}
      <div className="flex flex-col lg:flex-row lg:items-start">

        {/* LEFT — chart + metrics */}
        <div className="flex-1 min-w-0 p-4 space-y-3">

          {/* Chart */}
          <LiveChart
            ticker={market.symbol}
            strikePrice={market.strike_price}
            durationMin={market.duration_min}
            opensAt={market.opens_at}
            resolveAt={resolveTarget}
            marketStatus={market.status}
            liveCountdown={liveCountdown}
          />

          {/* Round result */}
          {isResolved && market.outcome && (
            <div className={`rounded-2xl px-4 py-3 border ${
              market.outcome === "up"
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-red-500/10 border-red-500/30"
            }`}>
              <p className={`text-center text-sm font-bold mb-2 ${market.outcome === "up" ? "text-emerald-400" : "text-red-400"}`}>
                {market.outcome === "up" ? "↑ UP won this round" : "↓ DOWN won this round"}
              </p>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Strike</span>
                <span className="font-semibold text-foreground">${formatPrice(market.strike_price)}</span>
              </div>
              {market.open_price != null && (
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Close</span>
                  <span className={`font-semibold ${market.outcome === "up" ? "text-emerald-400" : "text-red-400"}`}>
                    ${formatPrice(market.open_price)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* My bets */}
          {currentRoundBets.length > 0 && (
            <div className="space-y-2">
              {currentRoundBets.map(bet => (
                <div key={bet.id} className={`rounded-2xl px-4 py-3 flex items-center justify-between text-sm border ${
                  bet.status === "won"     ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                  bet.status === "lost"    ? "bg-red-500/10 text-red-400 border-red-500/20" :
                  bet.status === "claimed" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                  bet.status === "paid"    ? "bg-violet-500/10 text-violet-400 border-violet-500/20" :
                  "bg-muted/40 text-muted-foreground border-border"
                }`}>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">My predict</p>
                    <p className="font-bold">${bet.amount} USDC · {bet.direction === "up" ? "↑ UP" : "↓ DOWN"}</p>
                    {bet.status === "won" && bet.payout != null && (
                      <p className="text-xs mt-0.5 font-semibold">Win: ${Number(bet.payout).toFixed(2)} USDC</p>
                    )}
                    {bet.status === "refunded" && (
                      <p className="text-xs mt-0.5 font-semibold">Refund: ${Number(bet.amount).toFixed(2)} USDC</p>
                    )}
                  </div>
                  <span className="text-xs font-semibold shrink-0">
                    {(bet.status === "won" || bet.status === "refunded") && "🏆 Claim in dashboard"}
                    {bet.status === "claimed" && "⏳ Pending"}
                    {bet.status === "paid"    && "✅ Paid"}
                    {bet.status === "lost"    && "❌ Lost"}
                    {(bet.status === "pending" || bet.status === "approved") && "⏳ In progress"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Comments desktop */}
          <div className="hidden lg:block">
            <CommentsSection
              marketId={marketId}
              initialComments={[]}
              isAuthenticated={!!walletAddress}
              walletAddress={walletAddress ?? undefined}
              onRequestConnect={() => setShowWalletDialog(true)}
              apiBase="/api/markets"
            />
          </div>
        </div>

        {/* RIGHT — bet panel sticky */}
        <div className="w-full lg:w-80 lg:shrink-0 lg:sticky lg:top-0 p-4">
          <div className="rounded-2xl border border-border overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
              {meta.img
                ? <Image src={meta.img} alt={meta.symbol} width={28} height={28} className="rounded-lg bg-white p-0.5 shrink-0" />
                : <div className="flex size-7 items-center justify-center rounded-lg text-xs font-bold text-white shrink-0" style={{ background: meta.color }}>{meta.symbol[0]}</div>
              }
              <div>
                <p className="text-xs font-bold text-foreground">{meta.label} Up or Down {market.duration_min}m</p>
                {isOpen
                  ? liveCountdown === "Termine"
                    ? <p className="text-[10px] text-amber-500 font-semibold flex items-center gap-1"><Loader2 className="size-3 animate-spin" />Resolving…</p>
                    : <p className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />Live · {liveCountdown}</p>
                  : <p className="text-[10px] text-muted-foreground">{market.status}</p>
                }
              </div>
            </div>

            {isOpen ? (
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Quick predict</p>
                  <div className="grid grid-cols-2 gap-2">
                    {QUICK_AMOUNTS.map(q => (
                      <button key={q} type="button" onClick={() => setAmount(q)}
                        className={`rounded-xl border py-2.5 text-sm font-bold transition-colors ${
                          amount === q ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:border-primary/40 bg-muted/30"
                        }`}>
                        ${q}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
                  <span className="text-sm text-muted-foreground font-semibold">$</span>
                  <input
                    type="number" min={MIN_AMOUNT} step="1" value={amount}
                    onChange={e => setAmount(Number(e.target.value))}
                    className="flex-1 bg-transparent text-sm font-bold text-foreground focus:outline-none"
                    placeholder="Custom amount"
                  />
                  <span className="text-xs text-muted-foreground">USDC</span>
                </div>
                {/* Pool distribution bar */}
                {totalPool > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-semibold">
                      <span className="text-emerald-500">↑ UP {upPct}%</span>
                      <span className="text-red-500">{downPct}% DOWN ↓</span>
                    </div>
                    <div className="flex h-1.5 overflow-hidden rounded-full">
                      <div className="bg-emerald-500 transition-all" style={{ width: `${upPct}%` }} />
                      <div className="bg-red-500 transition-all" style={{ width: `${downPct}%` }} />
                    </div>
                    <p className="text-center text-[10px] text-muted-foreground">Pool: ${totalPool.toFixed(2)} USDC</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => handleBet("up")} disabled={submitting}
                    className={`rounded-2xl py-3 font-bold transition-all active:scale-95 disabled:opacity-60 flex flex-col items-center gap-0.5 ${
                      submitting && activeDir === "up" ? "bg-emerald-600 text-white" : "bg-emerald-500 hover:bg-emerald-400 text-white"
                    }`}>
                    <span>{submitting && activeDir === "up" ? "..." : "UP"}</span>
                    <span className="text-[10px] font-normal opacity-80">~${estPayout("up").toFixed(2)}</span>
                  </button>
                  <button onClick={() => handleBet("down")} disabled={submitting}
                    className={`rounded-2xl py-3 font-bold transition-all active:scale-95 disabled:opacity-60 flex flex-col items-center gap-0.5 ${
                      submitting && activeDir === "down" ? "bg-red-600 text-white" : "bg-red-500 hover:bg-red-400 text-white"
                    }`}>
                    <span>{submitting && activeDir === "down" ? "..." : "DOWN"}</span>
                    <span className="text-[10px] font-normal opacity-80">~${estPayout("down").toFixed(2)}</span>
                  </button>
                </div>
                <p className="text-center text-[10px] text-muted-foreground">Min $2 · USDC · Multiple bets allowed</p>
              </div>
            ) : (
              <div className="p-6 text-center space-y-1">
                <p className="text-sm font-semibold text-foreground">{market.status === "resolved" ? "Round resolved" : "Round cancelled"}</p>
                {market.outcome && (
                  <p className={`text-sm font-bold ${market.outcome === "up" ? "text-emerald-400" : "text-red-400"}`}>
                    {market.outcome === "up" ? "↑ UP won" : "↓ DOWN won"}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comments mobile */}
      <div className="lg:hidden px-4 pb-6">
        <CommentsSection
          marketId={marketId}
          initialComments={[]}
          isAuthenticated={!!walletAddress}
          walletAddress={walletAddress ?? undefined}
          onRequestConnect={() => setShowWalletDialog(true)}
          apiBase="/api/markets"
        />
      </div>

      {showWalletDialog && (
        <WalletSelectDialog
          wallets={getAvailableWallets()}
          onClose={() => setShowWalletDialog(false)}
          onSelect={async (walletType: WalletType) => {
            setShowWalletDialog(false);
            try {
              await connectWalletAndAuth(walletType);
            } catch (e) {
              toast.error("Connection failed");
            }
          }}
        />
      )}
    </div>
  );
}
