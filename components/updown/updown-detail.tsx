"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Clock, ArrowLeft } from "lucide-react";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer,
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
      if (diff <= 0) { setRemaining("00:00"); return; }
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

const LiveChart = memo(function LiveChart({ ticker, strikePrice, durationMin, opensAt, bettingClosesAt, resolveAt, marketStatus }: { ticker: string; strikePrice: number; durationMin: number; opensAt: string; bettingClosesAt: string; resolveAt: string | null; marketStatus: string }) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(getSupabase());
  const meta = COIN_META[ticker] ?? { label: ticker, symbol: ticker, color: "#888", img: "" };

  // Betting open state — triggers re-render exactly at bettingClosesAt
  const [isBettingOpen, setIsBettingOpen] = useState(
    () => new Date(bettingClosesAt) > new Date()
  );
  useEffect(() => {
    const ms = new Date(bettingClosesAt).getTime() - Date.now();
    if (ms <= 0) { setIsBettingOpen(false); return; }
    setIsBettingOpen(true);
    const id = setTimeout(() => setIsBettingOpen(false), ms);
    return () => clearTimeout(id);
  }, [bettingClosesAt]);

  const bettingCountdown = useCountdown(isBettingOpen ? bettingClosesAt : null);

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

  // Reçoit un prix brut et l'agrège dans la bougie de la seconde courante
  const pushPrice = useCallback((price: number) => {
    const sec = Math.floor(Date.now() / 1000) * 1000; // timestamp arrondi à la seconde
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
      setPoints(pts.slice(-MAX_POINTS));
      setCurrentPrice(pts[pts.length - 1].price);
      setLoading(false);
      resolved = true;
    };

    // Timeout securite: 4s max puis on cache le loading
    const timeout = setTimeout(() => setLoading(false), 4000);

    // Klines 1s — 60 bougies d'historique au démarrage
    fetch(`https://api.binance.com/api/v3/klines?symbol=${ticker}&interval=1s&limit=60`)
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
        // Fallback 1m si klines 1s indisponible
        fetch(`https://api.binance.com/api/v3/klines?symbol=${ticker}&interval=1m&limit=60`)
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
            }
          })
          .catch(() => {});
      });

    return () => clearTimeout(timeout);
  }, [ticker]);

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
    let destroyed = false;

    const stopAll = () => {
      if (wsTimeout) { clearTimeout(wsTimeout); wsTimeout = null; }
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
      pollId = setInterval(poll, 200);
    };

    const startWs = () => {
      if (destroyed) return;
      stopAll();
      setLive(false);
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
          const d = JSON.parse(e.data as string) as { p: string; T: number };
          pushPrice(parseFloat(d.p));
          setLive(true);
        };
        ws.onerror = () => { clearInterval(watchdog); ws?.close(); if (!destroyed) startPolling(); };
        ws.onclose = () => { clearInterval(watchdog); if (!destroyed && pollId === null) startPolling(); };
      } catch { clearInterval(watchdog); startPolling(); }
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

  // Domaine Y réactif : calculé depuis les prix réels de la fenêtre visible.
  // Plus le prix est stable → fenêtre se resserre → chaque centime devient visible.
  // Plus le prix bouge → fenêtre s'élargit automatiquement.
  // Le strike est toujours inclus dans la fenêtre.
  const recentPrices = points.slice(-MAX_POINTS).map(p => p.price);
  const allPrices = recentPrices.length > 0
    ? [...recentPrices, strikePrice]
    : [strikePrice];
  const minP  = Math.min(...allPrices);
  const maxP  = Math.max(...allPrices);
  const spread = maxP - minP;
  // Pad = 15% du spread observé — amplifie les micro-mouvements quand le marché est calme,
  // s'étire naturellement quand ça bouge. Minimum absolu = 1 tick par asset.
  const MIN_SPREAD: Record<string, number> = { BTCUSDT: 0.5, ETHUSDT: 0.05, SOLUSDT: 0.005 };
  const minSpread = MIN_SPREAD[ticker] ?? 0.5;
  const effectiveSpread = Math.max(spread, minSpread);
  const pad = effectiveSpread * 0.15;
  const yDomain: [number, number] = [minP - pad, maxP + pad];
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
          {isBettingOpen ? (
            <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
              {bettingCountdown}
            </span>
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
          {currentPrice != null ? `$${formatPrice(currentPrice)}` : "—"}
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
        📌 Le prix live (graphique) est indicatif. La résolution utilise le <strong>close Binance 1min</strong> à l&apos;heure de fin du round.
      </p>

      <div className="px-2 pb-4">
        {loading || points.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <span className="text-xs text-muted-foreground animate-pulse">
              {loading ? "Loading price data..." : "Waiting for first price..."}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={points} margin={{ top: 8, right: 56, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`fill-updown-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={lineColor} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={lineColor} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="time" tickFormatter={formatTime}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={50} />
              <YAxis
                domain={yDomain}
                orientation="right"
                tickFormatter={(v: number) => `$${v >= 1000 ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toFixed(3)}`}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={80}
                tickCount={10}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={strikePrice} stroke="#60a5fa" strokeDasharray="5 3" strokeWidth={1.5}
                label={{ value: "Strike", position: "insideTopLeft", fontSize: 9, fill: "#60a5fa" }} />
              <Area type="monotoneX" dataKey="price" stroke={lineColor} strokeWidth={2}
                fill={`url(#fill-updown-${ticker})`}
                dot={(props: any) => {
                  const { cx, cy, index } = props;
                  if (index !== points.length - 1) return <g key={index} />;
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

  // Ratios betting/live par durée totale du round
  const BETTING_MINUTES: Record<number, number> = { 5: 5, 15: 15, 30: 30 };

  // bettingClosesAt: calculé depuis opens_at + ratio betting
  // Si le marché a resolve_at, closes_at est déjà le vrai closes_at
  // Sinon (vieux marchés), on recalcule depuis opens_at
  const bettingClosesAt = market
    ? market.resolve_at
      ? market.closes_at  // nouveau marché: closes_at = fin des paris
      : new Date(
          new Date(market.opens_at).getTime() +
          (BETTING_MINUTES[market.duration_min] ?? 3) * 60_000
        ).toISOString()  // vieux marché: recalcul depuis opens_at
    : null;

  const resolveTarget = market
    ? market.resolve_at
      ?? new Date(
           new Date(market.opens_at).getTime() +
           (market.duration_min * 2) * 60_000
         ).toISOString()
    : null;

  // isBettingOpen: true tant que bettingClosesAt n'est pas atteint
  const [isBettingOpen, setIsBettingOpen] = useState(
    () => !!bettingClosesAt && new Date(bettingClosesAt) > new Date()
  );
  useEffect(() => {
    if (!bettingClosesAt || market?.status !== "open") { setIsBettingOpen(false); return; }
    const msUntilClose = new Date(bettingClosesAt).getTime() - Date.now();
    if (msUntilClose <= 0) { setIsBettingOpen(false); return; }
    setIsBettingOpen(true);
    const id = setTimeout(() => setIsBettingOpen(false), msUntilClose);
    return () => clearTimeout(id);
  }, [bettingClosesAt, market?.status]);

  const countdown = useCountdown(isBettingOpen ? bettingClosesAt : null);
  const liveCountdown = useCountdown(
    market?.status === "open" && !isBettingOpen ? resolveTarget : null
  );

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
      toast.success(`${dir.toUpperCase()} bet placed!`);
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
  // isBettingOpen est géré par le useState + timer ci-dessus (re-render automatique à closes_at)
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
            bettingClosesAt={bettingClosesAt ?? new Date(market.opens_at).toISOString()}
            resolveAt={resolveTarget}
            marketStatus={market.status}
          />

          {/* Round result */}
          {isResolved && market.outcome && (
            <div className={`rounded-2xl px-4 py-3 text-center text-sm font-bold border ${
              market.outcome === "up"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-red-500/10 text-red-400 border-red-500/30"
            }`}>
              {market.outcome === "up" ? "↑ UP won this round" : "↓ DOWN won this round"}
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
                    <p className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">My bet</p>
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
                {isBettingOpen
                  ? <p className="text-[10px] text-orange-500 font-semibold">Betting open</p>
                  : isOpen
                    ? <p className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />Live</p>
                    : <p className="text-[10px] text-muted-foreground">{market.status}</p>
                }
              </div>
            </div>

            {isBettingOpen ? (
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Quick bet</p>
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
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => handleBet("up")} disabled={submitting}
                    className={`rounded-2xl py-4 font-bold transition-all active:scale-95 disabled:opacity-60 ${
                      submitting && activeDir === "up" ? "bg-emerald-600 text-white" : "bg-emerald-500 hover:bg-emerald-400 text-white"
                    }`}>
                    {submitting && activeDir === "up" ? "..." : "UP"}
                  </button>
                  <button onClick={() => handleBet("down")} disabled={submitting}
                    className={`rounded-2xl py-4 font-bold transition-all active:scale-95 disabled:opacity-60 ${
                      submitting && activeDir === "down" ? "bg-red-600 text-white" : "bg-red-500 hover:bg-red-400 text-white"
                    }`}>
                    {submitting && activeDir === "down" ? "..." : "DOWN"}
                  </button>
                </div>
                <p className="text-center text-[10px] text-muted-foreground">Min $2 · USDC · Multiple bets allowed</p>
              </div>
            ) : isOpen ? (
              <div className="p-6 text-center space-y-1">
                <p className="text-2xl">🔒</p>
                <p className="text-sm font-semibold text-foreground">Bets are closed</p>
                <p className="text-xs text-muted-foreground">Waiting for resolution…</p>
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
