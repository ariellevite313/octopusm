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
    <div className="flex items-baseline gap-3 mb-5">
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        <i className="ti ti-flame text-orange-500 text-sm not-italic" aria-hidden="true" />
        Total volume
      </span>
      {display ? (
        <>
          <span className="text-2xl font-semibold text-foreground">
            {fmtUsd(display.totalVolume)}
          </span>
          {display.volume24h > 0 && (
            <span className="text-xs text-emerald-500 font-medium">
              +{fmtUsd(display.volume24h)} today
            </span>
          )}
        </>
      ) : (
        <span className="h-7 w-28 rounded-md bg-muted/40 animate-pulse inline-block" />
      )}
    </div>
  );
}
