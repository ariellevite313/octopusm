"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { Clock } from "lucide-react";

interface UpDownMarket {
  id: string;
  symbol: string;
  duration_min: number;
  strike_price: number;
  closes_at: string;
  status: "open" | "resolved" | "cancelled";
  outcome: "up" | "down" | null;
  pool_up: number;
  pool_down: number;
  fee_rate: number;
  open_price: number | null;
}

const SYMBOLS = [
  { value: "BTCUSDT", label: "Bitcoin",  short: "BTC", color: "#f59e0b" },
  { value: "ETHUSDT", label: "Ethereum", short: "ETH", color: "#3b82f6" },
  { value: "SOLUSDT", label: "Solana",   short: "SOL", color: "#9333ea" },
];

const DURATIONS = [5, 15, 30];

function formatPrice(p: number): string {
  if (p >= 1000) return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

// Card pour un seul round (une durée)
function DurationCard({ market, symColor, symLabel }: {
  market: UpDownMarket | undefined;
  symColor: string;
  symLabel: string;
}) {
  const countdown = useCountdown(market?.status === "open" ? market.closes_at : null);

  if (!market) {
    return (
      <div className="overflow-hidden rounded-2xl border border-dashed border-orange-200 bg-orange-50/30 dark:border-orange-900/20 dark:bg-orange-950/5">
        <div className="flex h-full min-h-[200px] items-center justify-center p-5">
          <p className="text-xs text-muted-foreground">Round pending...</p>
        </div>
      </div>
    );
  }

  const poolUp   = Number(market.pool_up);
  const poolDown = Number(market.pool_down);
  const total    = poolUp + poolDown;
  const upPct    = total > 0 ? Math.round((poolUp / total) * 100) : 50;
  const isOpen   = market.status === "open";
  const isResolved = market.status === "resolved";

  return (
    <Link
      href={`/crypto/${market.id}`}
      className="block overflow-hidden rounded-2xl border border-orange-200 bg-orange-50/60 shadow-none transition-shadow hover:shadow-md dark:border-orange-900/30 dark:bg-orange-950/5"
    >
      <div className="space-y-4 p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">
              {symLabel} · Up/Down
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Strike {formatPrice(market.strike_price)}
              </span>
              {isResolved && market.outcome && (
                <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  market.outcome === "up"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                }`}>
                  {market.outcome === "up" ? "↑ UP" : "↓ DOWN"}
                </span>
              )}
            </div>
          </div>
          {/* Countdown */}
          <div className="flex shrink-0 items-center gap-1 rounded-xl border border-orange-200 bg-white px-2.5 py-1 dark:border-orange-900/40 dark:bg-zinc-900">
            <Clock className="size-3 text-orange-500" />
            <span className="font-mono text-xs font-bold tabular-nums text-orange-600 dark:text-orange-400">
              {isOpen ? countdown : `${market.duration_min}m`}
            </span>
          </div>
        </div>

        {/* Pool bar */}
        <div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden flex mb-1">
            <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${upPct}%` }} />
            <div className="bg-red-500 flex-1" />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span className="text-emerald-600 font-semibold">↑ {upPct}%</span>
            <span>${total.toFixed(0)} USDC</span>
            <span className="text-red-500 font-semibold">{100 - upPct}% ↓</span>
          </div>
        </div>

        {/* UP / DOWN buttons — même style que options MarketCard */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-center gap-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">↑ UP</span>
            {isResolved && market.outcome === "up" && <span className="text-xs font-bold text-emerald-600">✓</span>}
          </div>
          <div className="flex items-center justify-center gap-1 rounded-2xl border border-red-200 bg-red-50 px-3 py-3 dark:border-red-900/40 dark:bg-red-950/20">
            <span className="text-xs font-semibold text-red-800 dark:text-red-200">↓ DOWN</span>
            {isResolved && market.outcome === "down" && <span className="text-xs font-bold text-red-500">✓</span>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-orange-100 pt-3 text-xs text-muted-foreground dark:border-orange-900/30">
          <span>{market.duration_min} minutes · {market.fee_rate}% fee</span>
          {isResolved && market.open_price && (
            <span className={`font-semibold ${Number(market.open_price) > market.strike_price ? "text-emerald-600" : "text-red-500"}`}>
              Close {formatPrice(Number(market.open_price))}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Export principal ───────────────────────────────────────────────────────────

export function UpDownCards() {
  const [activeSymbol, setActiveSymbol] = useState("BTCUSDT");
  const [markets, setMarkets] = useState<Record<number, UpDownMarket | undefined>>({});
  const [loading, setLoading] = useState(true);

  const fetchMarkets = useCallback(async () => {
    const res = await fetch(`/api/updown/markets?symbol=${activeSymbol}`);
    if (res.ok) {
      const d = await res.json() as { markets?: Record<string, { open?: UpDownMarket; resolved?: UpDownMarket }> };
      const result: Record<number, UpDownMarket> = {};
      for (const [k, slot] of Object.entries(d.markets ?? {})) {
        const m = slot.open ?? slot.resolved;
        if (m) result[Number(k)] = m;
      }
      setMarkets(result);
    }
    setLoading(false);
  }, [activeSymbol]);

  useEffect(() => {
    setLoading(true);
    void fetchMarkets();
    // Poll every 30s to pick up new rounds after resolution
    const id = setInterval(() => { void fetchMarkets(); }, 30_000);
    return () => clearInterval(id);
  }, [activeSymbol, fetchMarkets]);

  const sym = SYMBOLS.find(s => s.value === activeSymbol) ?? SYMBOLS[0];

  return (
    <>
      {/* Symbol selector — ligne horizontale compacte AU-DESSUS des cards, pas dans la grille */}
      <div className="col-span-full flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">Up/Down</span>
        {SYMBOLS.map(s => (
          <button
            key={s.value}
            type="button"
            onClick={() => setActiveSymbol(s.value)}
            className="rounded-full px-3 py-1 text-xs font-bold transition-colors"
            style={
              activeSymbol === s.value
                ? { background: s.color, color: "#fff" }
                : { border: "1px solid var(--border)", color: "var(--muted-foreground)", background: "transparent" }
            }
          >
            {s.short}
          </button>
        ))}
      </div>

      {/* 3 cards — une par durée */}
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-orange-200/50 bg-orange-50/30 dark:border-orange-900/20 dark:bg-orange-950/5">
            <div className="flex h-[200px] items-center justify-center">
              <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
            </div>
          </div>
        ))
      ) : (
        DURATIONS.map(d => (
          <DurationCard
            key={d}
            market={markets[d]}
            symColor={sym.color}
            symLabel={sym.label}
          />
        ))
      )}
    </>
  );
}
