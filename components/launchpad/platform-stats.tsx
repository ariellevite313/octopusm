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

export function PlatformStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/launchpad/platform-stats")
      .then(r => r.ok ? r.json() : null)
      .then((d: Stats | null) => { if (d) setStats(d); })
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-baseline gap-3 mb-5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        Volume cumulé
      </span>
      {stats ? (
        <>
          <span className="text-2xl font-semibold text-foreground">
            {fmtUsd(stats.totalVolume)}
          </span>
          {stats.volume24h > 0 && (
            <span className="text-xs text-emerald-500 font-medium">
              +{fmtUsd(stats.volume24h)} aujourd&apos;hui
            </span>
          )}
        </>
      ) : (
        <span className="h-7 w-28 rounded-md bg-muted/40 animate-pulse inline-block" />
      )}
    </div>
  );
}
