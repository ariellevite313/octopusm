"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Clock, ArrowLeft, Loader2, Hourglass, ChevronLeft, ChevronUp, ChevronDown, Share2, Scale, X, Plus } from "lucide-react";
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
import { ShareSheet } from "@/components/shared/share-sheet";
import { SwapKeypad } from "@/components/launchpad/swap-keypad";
import { TREASURY_ADDRESS, USDC_MINT } from "@/lib/market/betting";
import type { WalletType } from "@/lib/wallet/adapters";
import { useT, Rich } from "@/lib/i18n";
import { T, LOCALES } from "@/lib/i18n-mark";

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
  BTCUSDT:  { label: "Bitcoin",  symbol: "BTC",  color: "#f59e0b", img: "/bitcoin.png" },
  ETHUSDT:  { label: "Ethereum", symbol: "ETH",  color: "#3b82f6", img: "/ethereum.png" },
  SOLUSDT:  { label: "Solana",   symbol: "SOL",  color: "#9333ea", img: "/solana.png" },
  BNBUSDT:  { label: "BNB",      symbol: "BNB",  color: "#F3BA2F", img: "/bnb.png" },
  PEPEUSDT: { label: "Pepe",     symbol: "PEPE", color: "#4CAF50", img: "/pepe.png" },
  DOGEUSDT: { label: "Dogecoin", symbol: "DOGE", color: "#C2A633", img: "/doge.png" },
};

const MARKET_STATUS_LABEL: Record<string, string> = {
  open: T("Open"),
  resolved: T("Resolved"),
  cancelled: T("Cancelled"),
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

function formatPrice(p: number, locale = "en-US"): string {
  if (p >= 1000)   return p.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1)      return p.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (p >= 0.01)   return p.toFixed(4);
  if (p >= 0.0001) return p.toFixed(6);
  return p.toFixed(8);
}

function formatTime(ms: number, locale = "en-US"): string {
  return new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function useCountdown(closeAt: string | null | undefined): string {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!closeAt) return;
    const target = new Date(closeAt).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setRemaining("Termine"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(
        h > 0
          ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
          : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      );
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [closeAt]);
  return remaining;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { value: number; payload: PricePoint }[] }) {
  const { lang } = useT();
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-mono font-semibold text-foreground">${formatPrice(pt.price, LOCALES[lang])}</p>
      <p className="text-muted-foreground">{formatTime(pt.time, LOCALES[lang])}</p>
    </div>
  );
}

const LiveChart = memo(function LiveChart({ ticker, strikePrice, durationMin, opensAt, resolveAt, marketStatus, liveCountdown }: { ticker: string; strikePrice: number; durationMin: number; opensAt: string; resolveAt: string | null; marketStatus: string; liveCountdown: string; }) {
  const { tr, lang } = useT();
  const localeRef = useRef(LOCALES[lang]);
  localeRef.current = LOCALES[lang];
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

  // ── Refs pour mise à jour DOM sans re-render React ───────────────────────
  const displayPriceRef  = useRef<HTMLSpanElement>(null); // prix affiché 60fps via DOM direct
  const targetPriceRef   = useRef<number | null>(null);   // dernier prix réel Binance (WS)
  const pointsRef        = useRef<PricePoint[]>([]);       // miroir de points pour le RAF
  const rafIdRef         = useRef<number | null>(null);
  const lastChartTickRef = useRef(0);
  const smoothDataRef    = useRef<PricePoint[]>([]);

  // Sync pointsRef with points state so RAF can read without stale closure
  useEffect(() => { pointsRef.current = points; }, [points]);

  // ── RAF: affichage 60fps du prix réel Binance + point graphe chaque 1s ──
  useEffect(() => {
    const CHART_TICK_MS = 1000; // 1 point par seconde = prix exact Binance
    const MAX_SMOOTH    = 3600; // max 1h de points 1s

    const tick = () => {
      const now    = Date.now();
      const target = targetPriceRef.current;

      if (target != null) {
        // 60fps : mise à jour du span DOM sans re-render React
        if (displayPriceRef.current) {
          displayPriceRef.current.textContent = `$${formatPrice(target, localeRef.current)}`;
        }

        // 1s : ajouter le prix réel Binance comme point du graphe
        if (now - lastChartTickRef.current > CHART_TICK_MS) {
          lastChartTickRef.current = now;
          const hasSeed = smoothDataRef.current.length > 0 || pointsRef.current.length > 0;
          if (hasSeed) {
            if (smoothDataRef.current.length === 0) {
              smoothDataRef.current = [...pointsRef.current];
            }
            const pt: PricePoint = { time: now, price: target, open: target, high: target, low: target };
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
      return d.toLocaleDateString(LOCALES[lang], { month: "short", day: "numeric" }) + " · " +
        d.toLocaleTimeString(LOCALES[lang], { hour: "2-digit", minute: "2-digit" });
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

    // Priorité 1 : price_history (notre DB) — historique complet même après navigation
    const histFrom = marketDone && resolveAt
      ? new Date(opensAt).getTime()
      : Date.now() - 65_000;
    const histTo = marketDone && resolveAt
      ? new Date(resolveAt).getTime()
      : Date.now();

    fetch(`/api/crypto/history?symbol=${ticker}&from=${histFrom}&to=${histTo}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: { points: { time: number; price: number; open: number; high: number; low: number }[] }) => {
        if (Array.isArray(data?.points) && data.points.length > 0) {
          applyPoints(data.points);
        } else return Promise.reject();
      })
      .catch(() => {
        // Fallback: klines Binance directes si price_history est vide (ex: 1er démarrage)
        fetch(klinesUrl)
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
          .catch(() => {
            // Fallback final: proxy serveur
            fetch(`/api/crypto/klines?symbol=${ticker}&interval=1s&limit=60`)
              .then(r => r.ok ? r.json() : Promise.reject())
              .then((data: { time: number; price: number; open: number; high: number; low: number }[]) => {
                if (Array.isArray(data) && data.length > 0) applyPoints(data);
              })
              .catch(() => {});
          });
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

  const diffAbs = currentPrice != null ? currentPrice - strikePrice : null;

  return (
    <div>
      {/* En-tête */}
      <div className="flex items-center gap-3 pb-5">
        {meta.img
          ? <Image src={meta.img} alt={meta.symbol} width={52} height={52} className="size-[52px] shrink-0 rounded-2xl bg-white p-1 lg:size-14" />
          : <div className="flex size-[52px] shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ background: meta.color }}>{meta.symbol[0]}</div>}
        <div className="min-w-0">
          <h1 className="truncate text-[21px] font-bold tracking-tight text-foreground lg:text-[26px]">{tr("{coin} Up or Down · {n} min", { coin: meta.label, n: durationMin })}</h1>
          <p className="text-sm text-muted-foreground">{opensAtFormatted}</p>
        </div>
      </div>

      {/* Chiffres clés */}
      <div className="grid grid-cols-[1fr_1.15fr_0.9fr] gap-2 lg:flex lg:gap-14">
        <div className="min-w-0">
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground lg:text-[11px]">{tr("Price to beat")}</p>
          <p className="num mt-1 truncate text-[19px] font-bold tracking-tight text-muted-foreground lg:text-[26px]">${formatPrice(strikePrice, LOCALES[lang])}</p>
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground lg:text-[11px]">
            {tr("Live price")}
            {diffAbs != null && (
              <span className={`flex items-center gap-0.5 normal-case ${isAbove ? "text-up" : "text-down"}`}>
                <svg viewBox="0 0 10 10" className="size-2" aria-hidden><path d={isAbove ? "M0 9h10L5 1z" : "M0 1h10L5 9z"} fill="currentColor" /></svg>
                ${formatPrice(Math.abs(diffAbs), LOCALES[lang])}
              </span>
            )}
          </p>
          <p className={`num mt-1 truncate text-[19px] font-bold tracking-tight lg:text-[26px] ${currentPrice == null ? "text-foreground" : isAbove ? "text-up" : "text-down"}`}>
            {/* ref updated at 60fps via RAF without React re-render */}
            <span ref={displayPriceRef}>{currentPrice != null ? `$${formatPrice(currentPrice, LOCALES[lang])}` : "—"}</span>
          </p>
        </div>
        <div className="min-w-0 text-right lg:text-left">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground lg:text-[11px]">
            {marketStatus === "open" ? tr("Ends in") : tr("Status")}
          </p>
          <p className="num mt-1 flex items-center justify-end gap-1.5 text-[19px] font-bold tracking-tight text-foreground lg:justify-start lg:text-[26px]">
            {marketStatus === "open" ? (
              liveCountdownChart === "Termine"
                ? <><Loader2 className="size-4 animate-spin text-primary" /><span className="text-base">{tr("Resolving")}</span></>
                : <><Hourglass className="size-[18px] text-primary" strokeWidth={2.25} />{liveCountdownChart}</>
            ) : (
              <span className="text-base capitalize text-muted-foreground">{MARKET_STATUS_LABEL[marketStatus] ? tr(MARKET_STATUS_LABEL[marketStatus]) : marketStatus}</span>
            )}
          </p>
        </div>
      </div>

      <div className="-mx-2 pb-2 pt-4">
        {loading || points.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <span className="text-xs text-muted-foreground animate-pulse">
              {loading ? tr("Loading price data...") : tr("Waiting for first price...")}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={smoothData.length > 0 ? smoothData : points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`fill-updown-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={lineColor} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={lineColor} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={[xNow - WINDOW_MS, xNow]}
                tickFormatter={(ms: number) => formatTime(ms, LOCALES[lang])}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false} axisLine={false}
                tickCount={6}
              />
              <YAxis
                domain={yDomain}
                orientation="right"
                tickFormatter={(v: number) => {
                  if (v >= 10_000) return `$${Math.round(v).toLocaleString(LOCALES[lang])}`;
                  if (v >= 1_000) return `$${v.toLocaleString(LOCALES[lang], { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`;
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
                const labelText = tr("Target {price}", { price: formatPrice(strikePrice, LOCALES[lang]) }) + arrow;

                // X de début de l'axe Y (plot area se termine là)
                const yAxisX = yAxis.x ?? (w - (yAxis.width ?? 68));
                const labelW = 104;

                return (
                  <g>
                    {/* Ligne de target — fade quand prix proche, invisible si hors vue */}
                    {inView && (
                      <line
                        x1={m?.left ?? 0}
                        y1={rawY}
                        x2={yAxisX}
                        y2={rawY}
                        stroke="var(--muted-foreground)"
                        strokeDasharray="2 6"
                        strokeWidth={2}
                        style={{ opacity: strikeLineOpacity, transition: 'opacity 0.5s ease' }}
                      />
                    )}
                    {/* Label target — toujours visible, se déplace avec transition */}
                    <g style={{ transform: `translateY(${labelY}px)`, transition: 'transform 0.3s ease' }}>
                      <rect
                        x={yAxisX + 68 - labelW}
                        y={-10}
                        width={labelW}
                        height={20}
                        rx={6}
                        fill="var(--muted)"
                        fillOpacity={1}
                      />
                      <text
                        x={yAxisX + 68 - labelW / 2}
                        y={4}
                        textAnchor="middle"
                        fill="var(--foreground)"
                        fontSize={10}
                        fontWeight="600"
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
      {/* S-05: informer que la résolution utilise le close klines 1min, pas le prix live */}

    </div>
  );
});

export function UpDownDetail({ marketId }: { marketId: string }) {
  const [shareOpen, setShareOpen] = useState(false);
  const router = useRouter();
  const { tr, lang } = useT();
  const { walletAddress, walletType } = useAuth();
  const [market, setMarket] = useState<UpDownMarket | null>(null);
  const [myBets, setMyBets] = useState<UpDownBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [activeDir, setActiveDir] = useState<"up" | "down" | null>(null);
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [rawAmt, setRawAmt] = useState("5");
  const [betDir, setBetDir] = useState<"up" | "down" | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(true);
  const [pastRounds, setPastRounds] = useState<{ id: string; opens_at: string; outcome: "up" | "down" | null }[]>([]);
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

  // Manches précédentes (même actif, même durée)
  const marketSymbol = market?.symbol; const marketDuration = market?.duration_min; const marketOpens = market?.opens_at;
  useEffect(() => {
    if (!marketSymbol || !marketDuration || !marketOpens) return;
    void supabase.current.from("updown_markets")
      .select("id, opens_at, outcome")
      .eq("symbol", marketSymbol).eq("duration_min", marketDuration).eq("status", "resolved")
      .lt("opens_at", marketOpens)
      .order("opens_at", { ascending: false }).limit(6)
      .then(({ data }: { data: { id: string; opens_at: string; outcome: "up" | "down" | null }[] | null }) => setPastRounds(data ?? []));
  }, [marketSymbol, marketDuration, marketOpens]);

  // Fenêtre de mise : bloque le défilement + fermeture après la mise
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [sheetOpen]);

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
    if (amount < MIN_AMOUNT) { toast.error(tr("Minimum ${min} USDC", { min: MIN_AMOUNT })); return; }
    if (!market) return;
    // Guard: block transaction if betting window has closed (avoids losing USDC on-chain)
    if (bettingClosed) { toast.error(tr("Betting is closed for this round")); return; }

    setSubmitting(true);
    setActiveDir(dir);
    try {
      // Wallet EVM (MetaMask) : mise en USDC natif sur Arc
      if (walletType === "metamask") {
        const { submitUpDownArc } = await import("@/lib/market/updown-arc");
        const r = await submitUpDownArc({ marketId: market.id, direction: dir, amount, walletAddress });
        if (!r.success) { toast.error(tr(r.error)); return; }
        toast.success(dir === "up" ? tr("UP predict placed!") : tr("DOWN predict placed!"));
        setSheetOpen(false);
        void fetchMyBets();
        void fetchMarket();
        return;
      }
      const web3 = await import("@solana/web3.js");
      const { Connection, PublicKey, Transaction, TransactionInstruction } = web3;
      const adapters = await import("@/lib/wallet/adapters");
      let provider = adapters.getProviderByType(walletType);
      if (!provider && typeof window !== "undefined") {
        const w = window as any;
        if (w.solana?.signAndSendTransaction || w.solana?.signTransaction) provider = w.solana;
      }
      if (!provider) { toast.error(tr("Wallet not found")); return; }

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

      if (!signature) { toast.error(tr("Transaction failed")); return; }

      const res = await fetch("/api/updown/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market_id: market.id, wallet_address: walletAddress, direction: dir, amount, tx_signature: signature }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast.error(tr(err.error ?? "Server error"));
        return;
      }
      toast.success(dir === "up" ? tr("UP predict placed!") : tr("DOWN predict placed!"));
      setSheetOpen(false);
      void fetchMyBets();
      void fetchMarket();
    } catch (e: any) {
      const msg = (e?.message ?? "").toLowerCase();
      if (msg.includes("cancel") || msg.includes("reject")) toast.error(tr("Transaction cancelled"));
      else toast.error(tr("Error: {msg}", { msg: e?.message ?? "" }));
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
    return <div className="py-20 text-center text-sm text-muted-foreground">{tr("Market not found.")}</div>;
  }

  const isOpen      = market.status === "open";
  const isResolved  = market.status === "resolved";
  // Betting is locked as soon as closes_at is past, even if status hasn't updated yet
  const bettingClosed = !isOpen || liveCountdown === "Termine" ||
    (resolveTarget != null && Date.now() >= new Date(resolveTarget).getTime());
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

  const multUp   = amount > 0 ? estPayout("up") / amount : 0;
  const multDown = amount > 0 ? estPayout("down") / amount : 0;
  const selDir: "up" | "down" = betDir ?? "up";

  function setAmt(v: string) {
    setRawAmt(v);
    setAmount(parseFloat(v) || 0);
  }

  // Panneau de mise (ordinateur : colonne de droite · téléphone : fenêtre du bas)
  const betPanel = (withKeypad: boolean) => (
    isOpen && bettingClosed ? (
      <div className="py-8 text-center">
        <Loader2 className="mx-auto mb-2 size-5 animate-spin text-primary" />
        <p className="text-sm font-semibold text-foreground">{tr("Resolving…")}</p>
        <p className="text-xs text-muted-foreground">{tr("Betting is closed. Awaiting outcome.")}</p>
      </div>
    ) : !isOpen ? (
      <div className="py-8 text-center">
        <p className="text-sm font-semibold text-foreground">{market.status === "resolved" ? tr("Round resolved") : tr("Round cancelled")}</p>
        {market.outcome && (
          <p className={`mt-1 text-sm font-bold ${market.outcome === "up" ? "text-up" : "text-down"}`}>{market.outcome === "up" ? tr("Up won") : tr("Down won")}</p>
        )}
      </div>
    ) : (
      <div>
        <div className="grid grid-cols-2 gap-2.5">
          {(["up", "down"] as const).map((d) => {
            const on = selDir === d;
            const Icon = d === "up" ? ChevronUp : ChevronDown;
            return (
              <button key={d} type="button" onClick={() => setBetDir(d)}
                className={`flex h-[52px] items-center justify-center gap-1.5 rounded-2xl text-[16px] font-bold transition-colors ${
                  on
                    ? d === "up" ? "bg-up/15 text-up ring-[1.5px] ring-up/50" : "bg-down/15 text-down ring-[1.5px] ring-down/50"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}>
                <Icon className="size-[18px]" strokeWidth={3} />
                {d === "up" ? tr("Up") : tr("Down")} <span className="num">{(d === "up" ? multUp : multDown).toFixed(2)}x</span>
              </button>
            );
          })}
        </div>

        <p className="mt-5 text-[15px] font-semibold text-foreground">{tr("Amount")}</p>
        {withKeypad ? (
          <div className="flex items-baseline justify-center gap-2 py-3">
            <span className={`num text-[48px] font-bold leading-none tracking-tight ${rawAmt ? "text-foreground" : "text-muted-foreground/50"}`}>{rawAmt || "0"}</span>
            <span className="text-lg font-bold text-muted-foreground">USDC</span>
          </div>
        ) : (
          <div className="mt-2 flex items-baseline justify-between rounded-2xl bg-muted px-4 py-3">
            <input
              type="text" inputMode="decimal" value={rawAmt}
              onChange={(e) => setAmt(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))}
              placeholder="0"
              className="num w-full min-w-0 bg-transparent text-[28px] font-bold text-foreground outline-none placeholder:text-muted-foreground/50"
            />
            <span className="shrink-0 font-bold text-muted-foreground">USDC</span>
          </div>
        )}
        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          {[1, 5, 10, 100].map((v) => (
            <button key={v} type="button" onClick={() => setAmt(String(Math.round(((parseFloat(rawAmt) || 0) + v) * 100) / 100))}
              className="num flex items-center justify-center gap-0.5 rounded-xl bg-muted py-2 text-[13px] font-bold text-foreground transition-colors hover:bg-muted/70">
              <Plus className="size-3" />${v}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[15px] text-muted-foreground">
            {tr("To win")}
            <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${selDir === "up" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>{selDir === "up" ? tr("Up") : tr("Down")}</span>
          </span>
          <span className="num text-[28px] font-bold leading-none text-up">${(amount >= MIN_AMOUNT ? estPayout(selDir) : 0).toFixed(2)}</span>
        </div>
        {totalPool > 0 && (
          <div className="mt-3">
            <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
              <div className="rounded-full bg-up" style={{ width: `${upPct}%` }} />
              <div className="flex-1 rounded-full bg-down" />
            </div>
            <p className="num mt-1 flex justify-between text-[11px] text-muted-foreground"><span>{tr("{pct}% Up", { pct: upPct })}</span><span>{tr("Pool ${total}", { total: totalPool.toFixed(2) })}</span><span>{tr("{pct}% Down", { pct: downPct })}</span></p>
          </div>
        )}

        <button type="button" onClick={() => void handleBet(selDir)} disabled={submitting}
          className="mt-4 h-[52px] w-full rounded-2xl bg-primary text-base font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60">
          {submitting ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />{tr("Confirming…")}</span>
            : !walletAddress ? tr("Connect wallet") : (selDir === "up" ? tr("Buy Up") : tr("Buy Down"))}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">{tr("Min ${min} · USDC · Multiple bets allowed", { min: MIN_AMOUNT })}</p>

        {withKeypad && <div className="mt-2"><SwapKeypad value={rawAmt} onChange={setAmt} maxDecimals={2} /></div>}
      </div>
    )
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 pb-8 pt-3 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8 lg:pt-5">

        {/* ── Colonne principale ── */}
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => router.back()} className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ChevronLeft className="size-5" /><span className="hidden lg:inline">{tr("Up / Down")}</span>
            </button>
            <button type="button" aria-label={tr("Share")}
              onClick={() => setShareOpen(true)}
              className="flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted">
              <Share2 className="size-5" />
            </button>
            <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} images={["/og-omdot.png"]} text={tr("Up or down? Trade it on OMdotfun")} />
          </div>

          <LiveChart
            ticker={market.symbol}
            strikePrice={market.strike_price}
            durationMin={market.duration_min}
            opensAt={market.opens_at}
            resolveAt={resolveTarget}
            marketStatus={market.status}
            liveCountdown={liveCountdown}
          />

          {/* Manches précédentes */}
          {pastRounds.length > 0 && (
            <div className="mt-2 flex items-center gap-4 overflow-x-auto border-t border-border py-4 scrollbar-none">
              <span className="flex shrink-0 items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm font-bold text-foreground">
                {tr("Past")}
                <span className="h-4 w-px bg-foreground/15" />
                <span className={`flex size-5 items-center justify-center rounded-full ${pastRounds[0].outcome === "up" ? "bg-up" : "bg-down"}`}>
                  {pastRounds[0].outcome === "up" ? <ChevronUp className="size-3.5 text-white" strokeWidth={3} /> : <ChevronDown className="size-3.5 text-white" strokeWidth={3} />}
                </span>
              </span>
              {pastRounds.map((r) => (
                <button key={r.id} type="button" onClick={() => router.push(`/updown/${r.id}`)}
                  className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                  <span className={`size-1.5 rounded-full ${r.outcome === "up" ? "bg-up" : r.outcome === "down" ? "bg-down" : "bg-muted-foreground"}`} />
                  {new Intl.DateTimeFormat(LOCALES[lang], { hour: "numeric", minute: "2-digit" }).format(new Date(r.opens_at))}
                </button>
              ))}
            </div>
          )}

          {/* Up / Down (téléphone : ouvre la fenêtre de mise) */}
          {isOpen && !bettingClosed && (
            <div className="mt-2 lg:hidden">
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => { setBetDir("up"); setSheetOpen(true); }}
                  className="flex h-[58px] items-center justify-center gap-1.5 rounded-[18px] bg-up/15 text-[20px] font-bold text-up">
                  <ChevronUp className="size-5" strokeWidth={3} />{tr("Up")}
                </button>
                <button type="button" onClick={() => { setBetDir("down"); setSheetOpen(true); }}
                  className="flex h-[58px] items-center justify-center gap-1.5 rounded-[18px] bg-down/15 text-[20px] font-bold text-down">
                  <ChevronDown className="size-5" strokeWidth={3} />{tr("Down")}
                </button>
              </div>
              <div className="num mt-2 grid grid-cols-2 text-center text-[15px] font-semibold text-foreground">
                <span>{multUp.toFixed(2)}x</span><span>{multDown.toFixed(2)}x</span>
              </div>
            </div>
          )}

          {/* Résultat de la manche */}
          {isResolved && market.outcome && (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <p className={`text-base font-bold ${market.outcome === "up" ? "text-up" : "text-down"}`}>{market.outcome === "up" ? tr("Up won this round") : tr("Down won this round")}</p>
              <p className="num text-sm text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
                <Rich>{tr("Strike <b>${price}</b>", { price: formatPrice(market.strike_price, LOCALES[lang]) })}</Rich>
                {market.open_price != null && <> · <Rich>{tr("Close <b>${price}</b>", { price: formatPrice(market.open_price, LOCALES[lang]) })}</Rich></>}
              </p>
            </div>
          )}

          {/* Mes mises */}
          {currentRoundBets.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-[15px] font-bold text-foreground">{tr("My bets")}</p>
              {currentRoundBets.map(bet => (
                <div key={bet.id} className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
                  <span className="num font-semibold text-foreground">
                    ${bet.amount} USDC · <span className={bet.direction === "up" ? "text-up" : "text-down"}>{bet.direction === "up" ? tr("Up") : tr("Down")}</span>
                    {bet.status === "won" && bet.payout != null && <span className="ml-2 text-up">{tr("Win ${amount}", { amount: Number(bet.payout).toFixed(2) })}</span>}
                    {bet.status === "refunded" && <span className="ml-2 text-muted-foreground">{tr("Refund ${amount}", { amount: Number(bet.amount).toFixed(2) })}</span>}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {(bet.status === "won" || bet.status === "refunded") && tr("Claim in dashboard")}
                    {bet.status === "claimed" && tr("Pending")}
                    {bet.status === "paid" && tr("Paid")}
                    {bet.status === "lost" && tr("Lost")}
                    {(bet.status === "pending" || bet.status === "approved") && tr("In progress")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Règles */}
          <div className="mt-6">
            <button type="button" onClick={() => setRulesOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
              <span className="flex items-center gap-2.5 text-[17px] font-bold text-foreground"><Scale className="size-5" />{tr("Rules summary")}</span>
              {rulesOpen ? <ChevronUp className="size-5 text-muted-foreground" /> : <ChevronDown className="size-5 text-muted-foreground" />}
            </button>
            {rulesOpen && (
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
                <Rich>{tr("Resolves <b>Up</b> if {coin} closes above the price to beat (${price}) at the end of the round, otherwise <b>Down</b>.", { coin: meta.label, price: formatPrice(market.strike_price, LOCALES[lang]) })}</Rich>{" "}
                {tr("The live price on the chart is indicative — resolution uses the Binance 1-minute close at the end of the round.")}
              </p>
            )}
          </div>

          {/* Commentaires — téléphone */}
          <div className="mt-8 lg:hidden">
            <CommentsSection
              marketId={marketId}
              initialComments={[]}
              isAuthenticated={!!walletAddress}
              walletAddress={walletAddress ?? undefined}
              onRequestConnect={() => setShowWalletDialog(true)}
              apiBase="/api/updown"
            />
          </div>
        </div>

        {/* ── Colonne de droite (ordinateur) : mise + commentaires ── */}
        <aside className="hidden lg:block">
          <div className="sticky top-5 space-y-6">
            <div className="rounded-[24px] border border-border bg-card p-5">
              <p className="mb-4 text-[17px] font-bold text-foreground">{tr("Place your bet")}</p>
              {betPanel(false)}
            </div>
            <CommentsSection
              marketId={marketId}
              initialComments={[]}
              isAuthenticated={!!walletAddress}
              walletAddress={walletAddress ?? undefined}
              onRequestConnect={() => setShowWalletDialog(true)}
              apiBase="/api/updown"
            />
          </div>
        </aside>
      </div>

      {/* Fenêtre de mise — téléphone */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[60] flex items-end lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSheetOpen(false)} aria-hidden />
          <div className="relative max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] bg-card px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" />
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {meta.img
                  ? <Image src={meta.img} alt="" width={44} height={44} className="size-11 shrink-0 rounded-xl bg-white p-0.5" />
                  : <div className="flex size-11 shrink-0 items-center justify-center rounded-xl font-bold text-white" style={{ background: meta.color }}>{meta.symbol[0]}</div>}
                <p className="truncate text-[15px] font-semibold text-foreground">{tr("{coin} Up or Down · {n} min", { coin: meta.label, n: market.duration_min })}</p>
              </div>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label={tr("Close")} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <X className="size-4" />
              </button>
            </div>
            {betPanel(true)}
          </div>
        </div>
      )}

      {showWalletDialog && (
        <WalletSelectDialog
          wallets={getAvailableWallets()}
          onClose={() => setShowWalletDialog(false)}
          onSelect={async (walletType: WalletType) => {
            setShowWalletDialog(false);
            try {
              await connectWalletAndAuth(walletType);
            } catch (e) {
              toast.error(tr("Connection failed"));
            }
          }}
        />
      )}
    </div>
  );
}
