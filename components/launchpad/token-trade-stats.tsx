"use client";

/**
 * TokenTradeStats — buy/sell transaction statistics with timeframe selector.
 * Data: GeckoTerminal pool endpoint (no API key required).
 * Displays: buys vs sells count, buyers vs sellers count, total volume.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { TfStats, TradeStatsResponse } from "@/app/api/launchpad/trade-stats/[mint]/route";

type Tf = "m5" | "h1" | "h6" | "h24";

const TIMEFRAMES: { key: Tf; label: string }[] = [
  { key: "m5",  label: "5m" },
  { key: "h1",  label: "1h" },
  { key: "h6",  label: "6h" },
  { key: "h24", label: "1d" },
];

function fmtCount(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtVol(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function RatioBar({
  leftVal,
  rightVal,
}: {
  leftVal: number | null;
  rightVal: number | null;
}) {
  const total = (leftVal ?? 0) + (rightVal ?? 0);
  const pct = total > 0 ? Math.round(((leftVal ?? 0) / total) * 100) : 50;

  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden flex gap-px">
      <div
        className="h-full rounded-l-full bg-emerald-500 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
      <div className="h-full rounded-r-full bg-red-400 flex-1" />
    </div>
  );
}

function StatRow({
  leftCount,
  leftLabel,
  rightCount,
  rightLabel,
}: {
  leftCount:  number | null;
  leftLabel:  string;
  rightCount: number | null;
  rightLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-emerald-500">
          {fmtCount(leftCount)} <span className="text-muted-foreground font-normal">{leftLabel}</span>
        </span>
        <span className="text-[11px] font-medium text-red-400">
          <span className="text-muted-foreground font-normal">{rightLabel}</span> {fmtCount(rightCount)}
        </span>
      </div>
      <RatioBar leftVal={leftCount} rightVal={rightCount} />
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-2.5 w-24 rounded bg-muted/50" />
        <div className="flex gap-1">
          {TIMEFRAMES.map(t => (
            <div key={t.key} className="h-5 w-7 rounded-md bg-muted/50" />
          ))}
        </div>
      </div>
      {[1, 2].map(i => (
        <div key={i} className="space-y-1.5">
          <div className="flex justify-between">
            <div className="h-2.5 w-16 rounded bg-muted/40" />
            <div className="h-2.5 w-16 rounded bg-muted/40" />
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted/40" />
        </div>
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function TokenTradeStats({ mintAddress }: { mintAddress: string }) {
  const [allStats, setAllStats] = useState<TradeStatsResponse | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);
  const [tf,       setTf]       = useState<Tf>("h1");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/launchpad/trade-stats/${mintAddress}`)
      .then(r => r.ok ? r.json() as Promise<TradeStatsResponse> : Promise.reject())
      .then(d => { setAllStats(d); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [mintAddress]);

  if (loading)  return <Skeleton />;
  if (error || !allStats) return null;

  const stats: TfStats = allStats[tf];

  // Hide if the pool has literally no data for any timeframe
  const hasAnyData = (["m5", "h1", "h6", "h24"] as Tf[]).some(
    t => allStats[t].buys !== null || allStats[t].sells !== null
  );
  if (!hasAnyData) return null;

  return (
    <div>
      {/* Section header + timeframe selector */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Transactions
        </p>
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map(t => (
            <button
              key={t.key}
              onClick={() => setTf(t.key)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                tf === t.key
                  ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {/* Buys vs Sells */}
        <StatRow
          leftCount={stats.buys}
          leftLabel="Buys"
          rightCount={stats.sells}
          rightLabel="Sells"
        />

        {/* Buyers vs Sellers */}
        <StatRow
          leftCount={stats.buyers}
          leftLabel="Buyers"
          rightCount={stats.sellers}
          rightLabel="Sellers"
        />

        {/* Total volume — displayed without ratio (no buy/sell split from free API) */}
        {stats.volume !== null && (
          <div className="flex items-center justify-between pt-0.5 border-t border-border">
            <span className="text-[11px] text-muted-foreground">Volume</span>
            <span className="text-[11px] font-medium text-foreground">{fmtVol(stats.volume)}</span>
          </div>
        )}
      </div>

      <p className="mt-3 text-[9px] text-muted-foreground/40 text-right">Source: GeckoTerminal</p>
    </div>
  );
}
