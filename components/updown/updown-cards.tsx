"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, TrendingUp } from "lucide-react";
import { formatVolume } from "@/lib/market/utils";
import { useFakeLiveBets, FakeBetOverlay } from "@/components/market/market-fake-bets";
import { useT } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n-mark";
import { EmptyIcon } from "@/components/shared/empty-icon";

export interface UpDownMarket {
  id: string;
  symbol: string;
  duration_min: number;
  strike_price: number;
  status: "open" | "resolved" | "cancelled";
  closes_at: string;
  opens_at: string;
  resolve_at: string | null;
  outcome: "up" | "down" | null;
  open_price: number | null;
  pool_up: number;
  pool_down: number;
  fee_rate: number;
}

// Modèle Limitless : fenêtre unifiée, resolve_at = fin du round
export function getResolveAt(market: UpDownMarket): string {
  return market.resolve_at
    ?? new Date(new Date(market.opens_at).getTime() + market.duration_min * 60_000).toISOString();
}

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "PEPEUSDT", "DOGEUSDT"];
export const SYMBOL_LABELS: Record<string, string> = {
  BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL",
  BNBUSDT: "BNB", PEPEUSDT: "PEPE", DOGEUSDT: "DOGE",
};
export const SYMBOL_IMAGES: Record<string, string> = {
  BTCUSDT: "/bitcoin.png", ETHUSDT: "/ethereum.png", SOLUSDT: "/solana.png",
  BNBUSDT: "/bnb.png", PEPEUSDT: "/pepe.png", DOGEUSDT: "/doge.png",
};
const DURATIONS = [5, 15, 30, 60, 240, 1440];

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${min / 60}h`;
  return "24h";
}

export function formatPrice(p: number, locale = "en-US"): string {
  if (p >= 1000)   return p.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1)      return p.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (p >= 0.01)   return p.toFixed(4);
  if (p >= 0.0001) return p.toFixed(6);
  return p.toFixed(8);
}

export function useCountdown(closeAt: string | null | undefined): string {
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

export function UpDownCard({ market }: { market: UpDownMarket }) {
  const { tr, lang } = useT();
  const resolveAt     = getResolveAt(market);
  const isLive        = market.status === "open";
  const liveCountdown = useCountdown(isLive ? resolveAt : null);

  const poolUp   = Number(market.pool_up);
  const poolDown = Number(market.pool_down);
  const fakeBets = useFakeLiveBets(2, !(poolUp + poolDown > 0) || market.status !== "open");
  const total    = poolUp + poolDown;
  const upPct    = total > 0 ? Math.round((poolUp / total) * 100) : 50;
  const downPct  = 100 - upPct;
  const isResolved = market.status === "resolved";
  const label = SYMBOL_LABELS[market.symbol] ?? market.symbol;
  const img   = SYMBOL_IMAGES[market.symbol];

  return (
    <Link
      href={`/updown/${market.id}`}
      className="block overflow-hidden rounded-[22px] border border-border bg-card transition-colors hover:border-primary/40"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {img && <Image src={img} alt={label} width={28} height={28} className="rounded-xl shrink-0 bg-white p-0.5" />}
            <div className="min-w-0">
              <p className="text-[16px] font-bold leading-snug tracking-tight text-foreground">{tr("{sym} Up or Down", { sym: label })}</p>
              <p className="text-xs text-muted-foreground">{formatDuration(market.duration_min)} &middot; {tr("Strike ${price}", { price: formatPrice(market.strike_price, LOCALES[lang]) })}</p>
            </div>
          </div>
          {/* Badge Live + countdown résolution */}
          {isLive && (
            <div className="flex flex-col items-end gap-0.5">
              {liveCountdown === "Termine" ? (
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  <Loader2 className="size-3 animate-spin" />
                  {tr("Resolving")}
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {tr("Live")}
                </span>
              )}
              {liveCountdown !== "Termine" && (
                <span className="text-xs tabular-nums font-medium text-up">{liveCountdown}</span>
              )}
            </div>
          )}
          {isResolved && (
            <div className="flex flex-col items-end gap-0.5">
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${market.outcome === "up" ? "bg-up/12 text-up" : "bg-down/12 text-down"}`}>
                {market.outcome === "up" ? tr("▲ UP") : tr("▼ DOWN")}
              </span>
              {market.open_price != null && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {tr("Close ${price}", { price: formatPrice(market.open_price, LOCALES[lang]) })}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="relative flex items-center justify-center rounded-xl bg-up/12 px-3 py-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <FakeBetOverlay optionIndex={0} bets={fakeBets} />
            <span className="text-sm font-bold text-up">{tr("Up")}</span>
          </div>
          <div className="relative flex items-center justify-center rounded-xl bg-down/12 px-3 py-4 dark:border-red-900/40 dark:bg-red-950/20">
            <FakeBetOverlay optionIndex={1} bets={fakeBets} />
            <span className="text-sm font-bold text-down">{tr("Down")}</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex overflow-hidden rounded-full h-[3px]">
            <div className="bg-emerald-500 transition-all" style={{ width: `${upPct}%` }} />
            <div className="bg-red-500 transition-all" style={{ width: `${downPct}%` }} />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-up font-medium">{tr("{pct}% UP", { pct: upPct })}</span>
            <span className="text-red-600 font-medium">{tr("{pct}% DOWN", { pct: downPct })}</span>
          </div>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{tr("Volume")}</span>
            <span className="font-semibold text-foreground">{formatVolume(total, "usdc")}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

export function UpDownSection() {
  const { tr } = useT();
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
        <EmptyIcon icon={TrendingUp} />
        <p className="text-muted-foreground">{tr("No active Up/Down rounds at the moment.")}</p>
        <p className="text-xs text-muted-foreground">{tr("Rounds are created automatically.")}</p>
      </div>
    );
  }

  const visible = allMarkets.filter((m) => m.duration_min === activeDuration);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-muted/30 p-1 w-fit">
        {DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setActiveDuration(d)}
            className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition-colors ${activeDuration === d ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {formatDuration(d)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">{tr("No active {n} min round.", { n: activeDuration })}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => <UpDownCard key={m.id} market={m} />)}
        </div>
      )}
    </div>
  );
}
