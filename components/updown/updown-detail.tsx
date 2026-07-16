"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Clock, ArrowLeft } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart, Area, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer,
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

interface PricePoint { time: number; price: number; }

const COIN_META: Record<string, { label: string; symbol: string; color: string }> = {
  BTCUSDT: { label: "Bitcoin",  symbol: "BTC", color: "#f59e0b" },
  ETHUSDT: { label: "Ethereum", symbol: "ETH", color: "#3b82f6" },
  SOLUSDT: { label: "Solana",   symbol: "SOL", color: "#9333ea" },
};

const QUICK_AMOUNTS = [5, 25, 100, 500];
const MIN_AMOUNT = 2;
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

function LiveChart({ ticker, strikePrice }: { ticker: string; strikePrice: number }) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const realtimeActiveRef = useRef(false);
  const supabaseRef = useRef(getSupabase());
  const meta = COIN_META[ticker] ?? { label: ticker, symbol: ticker, color: "#888" };

  const pushPoint = useCallback((price: number, time: number) => {
    setCurrentPrice(price);
    setPoints(prev => {
      const next = [...prev, { time, price }];
      return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
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
            .map(r => ({ time: new Date(r.recorded_at).getTime(), price: Number(r.price) }));
          setPoints(pts);
          setCurrentPrice(pts[pts.length - 1].price);
        } else {
          fetch(`/api/crypto/klines?symbol=${ticker}`)
            .then(r => r.json())
            .then((pts: PricePoint[]) => {
              if (Array.isArray(pts) && pts.length > 0) {
                setPoints(pts);
                setCurrentPrice(pts[pts.length - 1].price);
              }
            })
            .catch(() => {});
        }
        setLoading(false);
      });
  }, [ticker]);

  useEffect(() => {
    const sb = supabaseRef.current;
    const channel = sb
      .channel(`updown-chart-${ticker}`)
      .on("postgres_changes" as const, {
        event: "INSERT", schema: "public", table: "crypto_prices", filter: `symbol=eq.${ticker}`,
      }, (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as { price: number; recorded_at: string };
        realtimeActiveRef.current = true;
        pushPoint(Number(row.price), new Date(row.recorded_at).getTime());
        setLive(true);
      })
      .subscribe((status: string) => { if (status === "SUBSCRIBED") setLive(true); });
    return () => { void sb.removeChannel(channel); };
  }, [ticker, pushPoint]);

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
    const startId = setTimeout(() => { poll(); pollId = setInterval(poll, POLL_INTERVAL_MS); }, 35_000);
    return () => { clearTimeout(startId); if (pollId) clearInterval(pollId); };
  }, [ticker, pushPoint]);

  const isAbove = currentPrice != null && currentPrice >= strikePrice;
  const allPrices = [...points.map(p => p.price), strikePrice];
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const pad = (maxP - minP) * 0.1 || strikePrice * 0.005;
  const yDomain: [number, number] = [minP - pad, maxP + pad];
  const lineColor = isAbove ? "#22c55e" : "#ef4444";
  const pctDiff = currentPrice != null ? ((currentPrice - strikePrice) / strikePrice) * 100 : null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
          style={{ background: meta.color }}>
          {meta.symbol[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">{meta.label} / USDT</p>
          <p className="text-[10px] text-muted-foreground">{meta.symbol}USDT · Real-time</p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className={`flex items-center gap-1 text-[10px] font-semibold ${live ? "text-emerald-500" : "text-muted-foreground"}`}>
            <span className={`inline-block size-1.5 rounded-full ${live ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
            {live ? "Live" : "Connecting..."}
          </span>
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

      <div className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">Strike price</span>
        <span className="text-xs font-semibold text-foreground">${formatPrice(strikePrice)}</span>
        <span className={`text-xs font-semibold ${isAbove ? "text-emerald-500" : "text-red-500"}`}>
          {isAbove ? "Above ↑" : "Below ↓"}
        </span>
      </div>

      <div className="px-2 pb-4">
        {loading || points.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <span className="text-xs text-muted-foreground animate-pulse">
              {loading ? "Loading price data..." : "Waiting for first price..."}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={`fill-updown-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={lineColor} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={lineColor} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tickFormatter={formatTime}
                tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40} />
              <YAxis domain={yDomain}
                tickFormatter={(v: number) => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(2)}`}
                tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                tickLine={false} axisLine={false} width={52} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={strikePrice} stroke="#60a5fa" strokeDasharray="5 3" strokeWidth={1.5}
                label={{ value: `Strike $${formatPrice(strikePrice)}`, position: "insideTopRight", fontSize: 8, fill: "#60a5fa" }} />
              <Area type="monotone" dataKey="price" stroke={lineColor} strokeWidth={2}
                fill={`url(#fill-updown-${ticker})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

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

  // Countdown jusqu'à la fin des paris (closes_at) — affiché tant que les paris sont ouverts
  const _bettingStillOpen = market?.status === "open" && new Date(market.closes_at) > new Date();
  const countdown = useCountdown(
    _bettingStillOpen ? market!.closes_at : null
  );
  // Countdown jusqu'à la résolution (resolve_at) — affiché pendant la phase LIVE
  const liveCountdown = useCountdown(
    market?.status === "open" && !_bettingStillOpen ? (market.resolve_at ?? null) : null
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
        `/api/updown/my-bet?market_id=${encodeURIComponent(marketId)}&wallet=${encodeURIComponent(addr)}`
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
  // Block bets as soon as closes_at is reached, even if cron hasn't resolved yet
  const isBettingOpen = isOpen && new Date(market.closes_at) > new Date();
  const totalPool  = (market.pool_up ?? 0) + (market.pool_down ?? 0);
  const meta       = COIN_META[market.symbol] ?? { label: market.symbol, symbol: market.symbol, color: "#888" };

  // Paris du round actuel uniquement
  const currentRoundBets = myBets.filter(b => b.market_id === marketId);

  function estPayout(dir: "up" | "down"): number {
    const myPool = dir === "up" ? (market!.pool_up ?? 0) : (market!.pool_down ?? 0);
    const oppPool = dir === "up" ? (market!.pool_down ?? 0) : (market!.pool_up ?? 0);
    const fee = market!.fee_rate ?? 0.05;
    if (myPool + amount <= 0) return amount;
    return amount + (amount / (myPool + amount)) * oppPool * (1 - fee);
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-4" /><span>Back</span>
      </button>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-card px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex size-10 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: meta.color }}>
            {meta.symbol[0]}
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{meta.label} Up/Down</h1>
            <p className="text-xs text-muted-foreground">{market.duration_min} min round · Strike ${formatPrice(market.strike_price)}</p>
          </div>
          <div className="ml-auto text-right">
            {isBettingOpen ? (
              <>
                <p className="text-xs text-muted-foreground">Closes in</p>
                <p className="text-base font-bold tabular-nums text-foreground flex items-center gap-1">
                  <Clock className="size-3.5 text-muted-foreground" />{countdown}
                </p>
              </>
            ) : isOpen ? (
              <div className="flex flex-col items-end gap-1">
                <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 flex items-center gap-1.5">
                  <span className="inline-block size-1.5 rounded-full bg-orange-500 animate-pulse" />
                  LIVE — Bets closed
                </span>
                {liveCountdown && (
                  <p className="text-xs text-muted-foreground tabular-nums flex items-center gap-1">
                    <Clock className="size-3 text-muted-foreground" />Resolves in {liveCountdown}
                  </p>
                )}
              </div>
            ) : (
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                isResolved ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" : "bg-amber-100 text-amber-700"
              }`}>
                {market.status === "resolved" ? "Resolved" : "Cancelled"}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 py-2.5">
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium uppercase tracking-wide">Pool UP</p>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">${(market.pool_up ?? 0).toFixed(0)}</p>
          </div>
          <div className="rounded-xl bg-muted/60 py-2.5">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Total</p>
            <p className="text-sm font-bold text-foreground">${totalPool.toFixed(0)}</p>
          </div>
          <div className="rounded-xl bg-red-50 dark:bg-red-950/20 py-2.5">
            <p className="text-[10px] text-red-600 dark:text-red-400 font-medium uppercase tracking-wide">Pool DOWN</p>
            <p className="text-sm font-bold text-red-700 dark:text-red-300">${(market.pool_down ?? 0).toFixed(0)}</p>
          </div>
        </div>

        {isResolved && market.outcome && (
          <div className={`mt-3 rounded-xl px-4 py-2.5 text-center text-sm font-bold ${
            market.outcome === "up"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
          }`}>
            {market.outcome === "up" ? "↑ UP won this round" : "↓ DOWN won this round"}
          </div>
        )}

        {isResolved && market.open_price && (
          <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3 text-sm mt-3">
            <span className="text-muted-foreground">Close price</span>
            <span className={`font-bold ${Number(market.open_price) > market.strike_price ? "text-emerald-600" : "text-red-500"}`}>
              ${formatPrice(Number(market.open_price))}
            </span>
          </div>
        )}
      </div>

      <LiveChart ticker={market.symbol} strikePrice={market.strike_price} />

      {/* Paris du round actuel */}
      {currentRoundBets.length > 0 && (
        <div className="space-y-2">
          {currentRoundBets.map(bet => (
            <div key={bet.id} className={`rounded-2xl px-5 py-4 flex items-center justify-between ${
              bet.status === "won"     ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" :
              bet.status === "lost"    ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400" :
              bet.status === "claimed" ? "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400" :
              bet.status === "paid"    ? "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400" :
              "bg-muted text-muted-foreground"
            }`}>
              <div>
                <p className="text-xs uppercase tracking-wide opacity-70 mb-0.5">My bet</p>
                <p className="font-bold">${bet.amount} USDC · {bet.direction === "up" ? "UP ↑" : "DOWN ↓"}</p>
                {bet.status === "won" && bet.payout && (
                  <p className="text-xs mt-0.5 font-semibold">Winnings: ${bet.payout.toFixed(2)} USDC</p>
                )}
              </div>
              {bet.status === "won"     && <span className="text-sm font-bold">🏆 Won — claim in your history</span>}
              {bet.status === "claimed" && <span className="text-sm font-medium">⏳ Payment pending</span>}
              {bet.status === "paid"    && <span className="text-sm font-medium">✅ Paid</span>}
              {bet.status === "lost"    && <span className="text-sm font-medium">❌ Lost</span>}
              {(bet.status === "pending" || bet.status === "approved") && <span className="text-sm font-medium">⏳ In progress...</span>}
            </div>
          ))}
        </div>
      )}

      {/* Formulaire de pari — visible uniquement si les paris sont ouverts */}
      {isBettingOpen && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground">Place a bet</h2>
          <div className="flex gap-2">
            {QUICK_AMOUNTS.map(q => (
              <button key={q} type="button" onClick={() => setAmount(q)}
                className={`flex-1 rounded-xl border py-2 text-sm font-bold transition-colors ${
                  amount === q ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
                }`}>
                ${q}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number" min={MIN_AMOUNT} step="1" value={amount}
              onChange={e => setAmount(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-sm text-muted-foreground">USDC</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleBet("up")} disabled={submitting}
              className={`flex flex-col items-center gap-1 rounded-2xl py-4 font-bold transition-all active:scale-95 disabled:opacity-60 ${
                submitting && activeDir === "up"
                  ? "bg-emerald-700 text-white"
                  : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
              }`}>
              <TrendingUp className="size-5" />
              <span className="text-sm">{submitting && activeDir === "up" ? "Processing..." : "UP"}</span>
              <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80">~${estPayout("up").toFixed(2)}</span>
            </button>
            <button onClick={() => handleBet("down")} disabled={submitting}
              className={`flex flex-col items-center gap-1 rounded-2xl py-4 font-bold transition-all active:scale-95 disabled:opacity-60 ${
                submitting && activeDir === "down"
                  ? "bg-red-700 text-white"
                  : "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/40"
              }`}>
              <TrendingDown className="size-5" />
              <span className="text-sm">{submitting && activeDir === "down" ? "Processing..." : "DOWN"}</span>
              <span className="text-xs text-red-600/80 dark:text-red-400/80">~${estPayout("down").toFixed(2)}</span>
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Min $2 · Multiple bets allowed · USDC only
          </p>
        </div>
      )}

      <CommentsSection
        marketId={marketId}
        initialComments={[]}
        isAuthenticated={!!walletAddress}
        walletAddress={walletAddress ?? undefined}
        onRequestConnect={() => setShowWalletDialog(true)}
        apiBase="/api/markets"
      />

      {showWalletDialog && (
        <WalletSelectDialog
          wallets={getAvailableWallets()}
          onClose={() => setShowWalletDialog(false)}
          onSelect={async (type: WalletType) => {
            setShowWalletDialog(false);
            try { await connectWalletAndAuth(type); }
            catch (e: any) { toast.error(e?.message ?? 'Connection failed'); }
          }}
        />
      )}
    </div>
  );
}
