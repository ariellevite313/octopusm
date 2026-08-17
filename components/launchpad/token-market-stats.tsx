"use client";

/**
 * TokenMarketStats — live market data from GeckoTerminal + Birdeye
 *
 * variant="bar"  → horizontal strip (full-width, borderless) — used on the detail page
 * variant="card" → vertical card with rows (legacy, kept for backward compat)
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Stats = {
  priceUsd:    number | null;
  marketCap:   number | null;
  fdv:         number | null;
  volume24h:   number | null;
  priceChange: number | null;
  holders:     number | null;
};

function fmt(n: number | null, opts?: { prefix?: string; decimals?: number }): string {
  if (n === null || isNaN(n)) return "—";
  const { prefix = "", decimals } = opts ?? {};
  let s: string;
  if (decimals !== undefined) {
    s = n.toFixed(decimals);
  } else if (Math.abs(n) >= 1_000_000_000) {
    s = `${(n / 1_000_000_000).toFixed(2)}B`;
  } else if (Math.abs(n) >= 1_000_000) {
    s = `${(n / 1_000_000).toFixed(2)}M`;
  } else if (Math.abs(n) >= 1_000) {
    s = `${(n / 1_000).toFixed(2)}K`;
  } else {
    s = n.toFixed(2);
  }
  return `${prefix}${s}`;
}

function fmtPrice(n: number | null): string {
  if (n === null) return "—";
  if (n < 0.000001) return `$${n.toFixed(10)}`;
  if (n < 0.001)    return `$${n.toFixed(8)}`;
  if (n < 1)        return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function fmtHolders(n: number | null): string {
  if (n === null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

async function fetchStats(mintAddress: string): Promise<Stats> {
  const res = await fetch(`/api/launchpad/token-stats/${mintAddress}`);
  if (!res.ok) throw new Error("Stats unavailable");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await res.json() as any;
}

// ── Bar variant (horizontal, borderless) ──────────────────────────────────────

function StatItem({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 shrink-0">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${accent ? "text-emerald-500" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function StatBar({ stats }: { stats: Stats }) {
  const changeColor =
    stats.priceChange === null ? "" :
    stats.priceChange > 0 ? "text-emerald-500" : "text-red-500";

  return (
    <div className="flex items-center gap-6 overflow-x-auto py-3 px-4 md:px-6 border-y border-border scrollbar-none">
      <StatItem
        label="Price"
        accent
        value={
          <span className="flex items-center gap-1.5">
            {fmtPrice(stats.priceUsd)}
            {stats.priceChange !== null && (
              <span className={`text-[10px] ${changeColor}`}>
                {stats.priceChange > 0 ? "+" : ""}{stats.priceChange.toFixed(2)}%
              </span>
            )}
          </span>
        }
      />
      {stats.marketCap !== null && (
        <StatItem label="Market cap" value={fmt(stats.marketCap, { prefix: "$" })} />
      )}
      {stats.fdv !== null && (
        <StatItem label="FDV" value={fmt(stats.fdv, { prefix: "$" })} />
      )}
      {stats.volume24h !== null && (
        <StatItem label="Volume 24h" value={fmt(stats.volume24h, { prefix: "$" })} />
      )}
      {stats.holders !== null && (
        <StatItem label="Holders" value={fmtHolders(stats.holders)} />
      )}
      <span className="ml-auto text-[9px] text-muted-foreground/50 shrink-0 hidden md:block">
        GeckoTerminal · Birdeye
      </span>
    </div>
  );
}

// ── Card variant (legacy vertical) ────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground">{value}</span>
    </div>
  );
}

function StatCard({ stats }: { stats: Stats }) {
  const changeColor =
    stats.priceChange === null ? "text-foreground" :
    stats.priceChange > 0 ? "text-emerald-500" : "text-red-500";

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
        Market
      </p>
      <Row
        label="Price"
        value={
          <span className="flex items-center gap-1.5">
            {fmtPrice(stats.priceUsd)}
            {stats.priceChange !== null && (
              <span className={`text-[10px] font-semibold ${changeColor}`}>
                {stats.priceChange > 0 ? "+" : ""}{stats.priceChange.toFixed(2)}%
              </span>
            )}
          </span>
        }
      />
      {stats.marketCap !== null && <Row label="Market Cap" value={fmt(stats.marketCap, { prefix: "$" })} />}
      {stats.fdv       !== null && <Row label="FDV"        value={fmt(stats.fdv,       { prefix: "$" })} />}
      {stats.volume24h !== null && <Row label="Volume 24h" value={fmt(stats.volume24h, { prefix: "$" })} />}
      {stats.holders   !== null && <Row label="Holders"    value={fmtHolders(stats.holders)} />}
      <p className="mt-2 text-[10px] text-muted-foreground text-right">
        Source: GeckoTerminal · Birdeye
      </p>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function TokenMarketStats({
  mintAddress,
  variant = "card",
}: {
  mintAddress: string;
  variant?: "bar" | "card";
}) {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchStats(mintAddress)
      .then(s  => setStats(s))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [mintAddress]);

  if (loading) {
    if (variant === "bar") {
      return (
        <div className="flex items-center gap-2 py-3 px-4 md:px-6 border-y border-border">
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Chargement…</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 py-6">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading market data…</span>
      </div>
    );
  }

  if (error || !stats) return null;

  return variant === "bar" ? <StatBar stats={stats} /> : <StatCard stats={stats} />;
}
