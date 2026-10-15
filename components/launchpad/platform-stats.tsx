"use client";

import { useEffect, useState } from "react";

type Stats = {
  totalVolume: number;
  volume24h:   number;
};

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

const FALLBACK: Stats = { totalVolume: 0, volume24h: 0 };

export function PlatformStats() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loaded, setLoaded]   = useState(false);

  useEffect(() => {
    fetch("/api/launchpad/platform-stats")
      .then(r => r.ok ? r.json() : FALLBACK)
      .then((d: Stats) => setStats(d))
      .catch(() => setStats(FALLBACK))
      .finally(() => setLoaded(true));
  }, []);

  const display = stats ?? (loaded ? FALLBACK : null);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground font-medium">
        Total volume
      </span>
      {display ? (
        <>
          <span className="flex items-center gap-2">
            <span className="num text-[38px] leading-none font-bold tracking-[-0.04em] text-foreground sm:text-[44px]">
              {fmtUsd(display.totalVolume)}
            </span>
          </span>
          {display.volume24h > 0 && (
            <span className="num text-[15px] font-semibold text-up">
              +{fmtUsd(display.volume24h)} today
            </span>
          )}
        </>
      ) : (
        <span className="h-12 w-48 rounded-2xl bg-muted animate-pulse inline-block" />
      )}
    </div>
  );
}

export function PlatformStatsInline() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    fetch("/api/launchpad/platform-stats").then(r => r.ok ? r.json() : FALLBACK).then((d: Stats) => setStats(d)).catch(() => setStats(FALLBACK));
  }, []);
  if (!stats) return <div className="mb-6 h-12" />;
  return (
    <div className="mb-6">
      <p className="text-[15px] text-muted-foreground">
        Total Volume : <span className="num text-[22px] font-bold text-foreground">{fmtUsd(stats.totalVolume)}</span>
      </p>
      {stats.volume24h > 0 && <p className="num text-sm font-semibold text-up">+{fmtUsd(stats.volume24h)} today</p>}
    </div>
  );
}
