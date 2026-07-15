"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

export interface UpDownMarket {
  id: string;
  symbol: string;
  duration_min: number;
  strike_price: number;
  status: "open" | "resolved" | "cancelled";
  closes_at: string;
  opens_at: string;
  outcome: "up" | "down" | null;
  open_price: number | null;
  pool_up: number;
  pool_down: number;
  fee_rate: number;
}

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
export const SYMBOL_LABELS: Record<string, string> = { BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL" };
export const SYMBOL_IMAGES: Record<string, string> = { BTCUSDT: "/bitcoin.png", ETHUSDT: "/ethereum.png", SOLUSDT: "/solana.png" };
const DURATIONS = [5, 15, 30];

export function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 4 });
}

export function useCountdown(closeAt: string | null | undefined): string {
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

export function UpDownCard({ market }: { market: UpDownMarket }) {
  const countdown = useCountdown(market.status === "open" ? market.closes_at : null);
  const poolUp   = Number(market.pool_up);
  const poolDown = Number(market.pool_down);
  const total    = poolUp + poolDown;
  const upPct    = total > 0 ? Math.round((poolUp / total) * 100) : 50;
  const downPct  = 100 - upPct;
  const isResolved = market.status === "resolved";
  const label = SYMBOL_LABELS[market.symbol] ?? market.symbol;
  const img   = SYMBOL_IMAGES[market.symbol];

  return (
    <Link
      href={`/crypto/${market.id}`}
      className="block overflow-hidden rounded-2xl border border-orange-200 bg-orange-50/60 shadow-none transition-shadow hover:shadow-md dark:border-orange-900/30 dark:bg-orange-950/5"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {img && <Image src={img} alt={label} width={28} height={28} className="rounded-full shrink-0 bg-white p-0.5" />}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{label} Up or Down</p>
              <p className="text-xs text-muted-foreground">{market.duration_min} Min &middot; Strike ${formatPrice(market.strike_price)}</p>
            </div>
          </div>
          {market.status === "open" && (
            <span className="shrink-0 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
              {countdown}
            </span>
          )}
          {isResolved && (
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${market.outcome === "up" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"}`}>
              {market.outcome === "up" ? "UP" : "DOWN"}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">UP</span>
          </div>
          <div className="flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-900/40 dark:bg-red-950/20">
            <span className="text-sm font-bold text-red-700 dark:text-red-400">DOWN</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex overflow-hidden rounded-full h-[3px]">
            <div className="bg-emerald-500 transition-all" style={{ width: `${upPct}%` }} />
            <div className="bg-red-500 transition-all" style={{ width: `${downPct}%` }} />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-emerald-600 font-medium">{upPct}% UP</span>
            <span className="text-red-600 font-medium">{downPct}% DOWN</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Volume</span>
          <span className="font-semibold text-foreground">${total.toFixed(2)} USDC</span>
        </div>
      </div>
    </Link>
  );
}

export function UpDownSection() {
  const [allMarkets, setAllMarkets] = useState<UpDownMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDuration, setActiveDuration] = useState<number>(5);

  const fetchAll = useCallback(async () => {
    const results: UpDownMarket[] = [];
    await Promise.all(
      SYMBOLS.map(async (symbol) => {
        try {
          const res = await fetch(`/api/updown/markets?symbol=${symbol}`);
          if (!res.ok) return;
          const d = await res.json() as { markets: Record<string, { open?: UpDownMarket; resolved?: UpDownMarket }> };
          for (const duration of DURATIONS) {
            const slot = d.markets?.[duration];
            const m = slot?.open ?? slot?.resolved;
            if (m) results.push(m);
          }
        } catch { /* ignore */ }
      })
    );
    results.sort((a, b) => {
      if (a.status === "open" && b.status !== "open") return -1;
      if (a.status !== "open" && b.status === "open") return 1;
      return a.symbol.localeCompare(b.symbol) || a.duration_min - b.duration_min;
    });
    setAllMarkets(results);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted/40" />
        ))}
      </div>
    );
  }

  if (allMarkets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <span className="text-4xl">📈</span>
        <p className="text-muted-foreground">No active Up/Down rounds at the moment.</p>
        <p className="text-xs text-muted-foreground">Rounds are created automatically.</p>
      </div>
    );
  }

  const visible = allMarkets.filter((m) => m.duration_min === activeDuration);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-2xl border border-border bg-muted/30 p-1 w-fit">
        {DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setActiveDuration(d)}
            className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition-colors ${activeDuration === d ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {d} Min
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">No active {activeDuration} min round.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => <UpDownCard key={m.id} market={m} />)}
        </div>
      )}
    </div>
  );
}
