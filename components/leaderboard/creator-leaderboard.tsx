"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Trophy, ArrowLeft } from "lucide-react";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

type Period = "24h" | "7d" | "30d" | "1y" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "24h", label: "24H"  },
  { key: "7d",  label: "7D"   },
  { key: "30d", label: "30D"  },
  { key: "1y",  label: "1Y"   },
  { key: "all", label: "All"  },
];

const MEDAL = ["🥇", "🥈", "🥉"];

function short(addr: string) {
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

function fmtSol(n: number) {
  if (n === 0) return "0 SOL";
  if (n >= 1) return `${n.toFixed(4)} SOL`;
  return `${n.toFixed(6)} SOL`;
}

function PodiumCard({ entry }: { entry: LeaderboardEntry }) {
  const heights = ["h-28", "h-20", "h-16"];
  const sizes   = ["text-3xl", "text-2xl", "text-xl"];
  const idx     = entry.rank - 1;

  return (
    <div className="flex flex-col items-center gap-2">
      <span className={`${sizes[idx]} font-bold text-foreground`}>{MEDAL[idx]}</span>
      <div className="flex flex-col items-center">
        <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
          {entry.walletAddress.slice(0, 2).toUpperCase()}
        </div>
        <p className="mt-1 text-xs font-mono text-foreground">{short(entry.walletAddress)}</p>
        <p className="text-xs font-bold text-primary">{fmtSol(entry.totalFeeSol)}</p>
      </div>
      <div
        className={`w-20 ${heights[idx]} rounded-t-xl flex items-end justify-center pb-2 text-xs font-bold text-white ${
          idx === 0 ? "bg-amber-400" : idx === 1 ? "bg-zinc-400" : "bg-amber-700"
        }`}
      >
        #{entry.rank}
      </div>
    </div>
  );
}

export function CreatorLeaderboard() {
  const [period,  setPeriod]  = useState<Period>("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/leaderboard?period=${period}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json() as Promise<{ entries: LeaderboardEntry[] }>;
      })
      .then((json) => setEntries(json.entries ?? []))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError("Failed to load leaderboard. Please try again.");
        setEntries([]);
      })
      .finally(() => setLoading(false));

    return controller;
  }, [period]);

  useEffect(() => {
    const controller = fetchData();
    return () => controller.abort();
  }, [fetchData]);

  const top3 = entries.slice(0, 3);
  const rest  = entries.slice(3);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">

      {/* Back */}
      <Link
        href="/launchpad"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Launchpad
      </Link>

      {/* Title */}
      <div className="mb-6 flex items-center gap-2">
        <Trophy className="size-5 text-amber-400" />
        <h1 className="text-xl font-bold text-foreground">Creator Leaderboard</h1>
      </div>

      {/* Period tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-muted p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
              period === p.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 py-12 text-center text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/10 dark:text-red-400">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No claims for this period.
        </p>
      ) : (
        <>
          {/* Podium */}
          {top3.length >= 3 && (
            <div className="mb-10 flex items-end justify-center gap-4">
              {[top3[1], top3[0], top3[2]].filter(Boolean).map(e => (
                <PodiumCard key={e.walletAddress} entry={e} />
              ))}
            </div>
          )}

          {/* Table */}
          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["#", "Creator", "Tokens", "Claims", "Total earned"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map(entry => (
                  <tr key={entry.walletAddress} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs font-bold text-muted-foreground w-8">
                      {entry.rank <= 3 ? MEDAL[entry.rank - 1] : `#${entry.rank}`}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {short(entry.walletAddress)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {entry.tokenCount}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {entry.claimCount}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-primary">
                      {fmtSol(entry.totalFeeSol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
