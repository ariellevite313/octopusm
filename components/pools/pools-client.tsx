"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { TokenLogo } from "@/components/shared/token-logo";
import { MutuelMarketRow, MutuelOption } from "@/lib/supabase/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeLeft(closesAt: string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}d left`;
  if (h >= 1) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function tokenLabel(token: string) {
  return token === "usdc" ? "USDC" : "ClawdTrust";
}

const STATUS_BADGE: Record<string, string> = {
  active:   "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-400",
  closed:   "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-400",
  resolved: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700/60 dark:bg-violet-950/30 dark:text-violet-400",
};

// ─── Pool Card ────────────────────────────────────────────────────────────────

function PoolCard({ market, betTotals }: { market: MutuelMarketRow; betTotals: Record<string, number> }) {
  const options = (market.options ?? []) as MutuelOption[];
  const rawTotal = options.reduce((s, o) => s + (betTotals[o.id] ?? 0), 0);
  const pool = market.bet_token === "usdc" ? market.total_pool_usdc : market.total_pool_clt;
  const decimals = market.bet_token === "usdc" ? 2 : 0;
  const isActive = market.status === "active";

  return (
    <div className="overflow-hidden rounded-2xl border border-orange-200 bg-orange-50/60 shadow-none dark:border-orange-900/30 dark:bg-orange-950/5">
      <div className="space-y-4 p-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">
              {market.category}
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-zinc-900 dark:text-zinc-100">
              {market.title}
            </p>
          </div>
          {isActive && (
            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE["active"]}`}>
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          )}
          {!isActive && (
            <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${STATUS_BADGE[market.status] ?? "border-border bg-muted text-muted-foreground"}`}>
              {market.status}
            </span>
          )}
        </div>

        {/* Options grid avec barres de probabilité */}
        <div className={options.length === 2 ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}>
          {options.map((opt) => {
            const amt = betTotals[opt.id] ?? 0;
            const pct = rawTotal > 0 ? Math.round((amt / rawTotal) * 100) : Math.round(100 / options.length);
            const isWinner = market.status === "resolved" && market.winning_option_id === opt.id;
            return (
              <div
                key={opt.id}
                className={`rounded-2xl border border-orange-200 bg-white px-3 py-2.5 dark:border-orange-900/40 dark:bg-zinc-900 ${market.status === "resolved" && !isWinner ? "opacity-40" : ""}`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className={`text-xs font-semibold leading-tight ${isWinner ? "text-orange-600 dark:text-orange-400" : "text-zinc-800 dark:text-zinc-200"}`}>
                    {isWinner && "🏆 "}{opt.label}
                  </span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-zinc-500">{pct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-orange-100 dark:bg-orange-950/40">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isWinner ? "bg-orange-500" : "bg-orange-400/70"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-orange-100 pt-3 dark:border-orange-900/30">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            💰 <span className="font-semibold text-zinc-700 dark:text-zinc-300">
              {pool.toFixed(decimals)} {tokenLabel(market.bet_token)}
            </span>
            <span className="ml-1 text-zinc-400">· {market.bet_count} bets</span>
          </span>
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <Clock className="size-3" />
                {timeLeft(market.betting_closes_at)}
              </span>
            )}
            <Link
              href={`/pools/${market.slug}`}
              className="rounded-full bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-400"
            >
              {isActive ? "Predict" : "View"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PoolsClient({ markets: initialMarkets }: { markets: MutuelMarketRow[] }) {
  const [markets, setMarkets] = useState<MutuelMarketRow[]>(initialMarkets);
  const [betTotals, setBetTotals] = useState<Record<string, Record<string, number>>>({});
  const [filter, setFilter] = useState<"all" | "active" | "closed" | "resolved">("all");

  const fetchTotals = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const res = await fetch(`/api/pools/totals?ids=${ids.join(",")}`);
      if (!res.ok) return;
      const data = await res.json() as Record<string, Record<string, number>>;
      setBetTotals(prev => ({ ...prev, ...data }));
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchTotals(markets.map(m => m.id)); }, [markets, fetchTotals]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/pools");
        if (!res.ok) return;
        const data = await res.json() as MutuelMarketRow[];
        setMarkets(data);
        fetchTotals(data.map(m => m.id));
      } catch { /* silent */ }
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchTotals]);

  const filtered = filter === "all" ? markets : markets.filter(m => m.status === filter);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Prediction Pools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Community-created pari-mutuel markets — odds update in real time.
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        {(["all", "active", "closed", "resolved"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              filter === f ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <span className="text-5xl">🎱</span>
          <p className="text-muted-foreground">No pools here yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(market => (
            <PoolCard key={market.id} market={market} betTotals={betTotals[market.id] ?? {}} />
          ))}
        </div>
      )}
    </div>
  );
}
