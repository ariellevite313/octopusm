"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Trophy, ArrowLeft, Crown } from "lucide-react";
import { PlatformStatsInline } from "@/components/launchpad/platform-stats";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

type Period = "24h" | "7d" | "30d" | "1y" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "24h", label: "24H"  },
  { key: "7d",  label: "7D"   },
  { key: "30d", label: "30D"  },
  { key: "1y",  label: "1Y"   },
  { key: "all", label: "All"  },
];

function short(addr: string) {
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

function Avatar({ entry, size = "md" }: { entry: LeaderboardEntry; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-7" : "size-11";
  const txt = size === "sm" ? "text-[10px]" : "text-xs";
  const initials = (entry.displayName ?? entry.walletAddress).slice(0, 2).toUpperCase();
  if (entry.avatarSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={entry.avatarSrc}
        alt={entry.displayName ?? entry.walletAddress}
        className={`${dim} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <div className={`${dim} rounded-full bg-primary/20 flex items-center justify-center ${txt} font-bold text-primary flex-shrink-0`}>
      {initials}
    </div>
  );
}

function displayLabel(entry: LeaderboardEntry) {
  return entry.displayName ?? short(entry.walletAddress);
}

function fmtSol(n: number) {
  if (n === 0) return "0 SOL";
  if (n >= 1) return `${n.toFixed(4)} SOL`;
  return `${n.toFixed(6)} SOL`;
}

// ── Visual helpers (podium) ─────────────────────────────────────────────────

const TONES = {
  gold:   { frame: "from-amber-100 via-amber-400 to-amber-700",   num: "from-amber-200 to-amber-500",   glow: "shadow-[0_0_40px_-6px_rgba(245,179,1,0.65)]",  text: "text-amber-400" },
  silver: { frame: "from-zinc-50 via-zinc-300 to-zinc-500",       num: "from-zinc-100 to-zinc-400",     glow: "shadow-[0_0_28px_-8px_rgba(212,212,216,0.5)]", text: "text-zinc-300" },
  bronze: { frame: "from-orange-200 via-orange-500 to-orange-700", num: "from-orange-200 to-orange-500", glow: "shadow-[0_0_28px_-8px_rgba(249,115,22,0.6)]",  text: "text-orange-400" },
  violet: { frame: "from-violet-200 via-violet-500 to-violet-800", num: "from-violet-200 to-violet-500", glow: "shadow-[0_0_28px_-8px_rgba(139,92,246,0.6)]",  text: "text-violet-400" },
} as const;

type Tone = keyof typeof TONES;

const RANK_TONE: Tone[] = ["gold", "silver", "bronze", "violet"];

function FrameCard({ entry, tone, className = "" }: { entry: LeaderboardEntry; tone: Tone; className?: string }) {
  const t = TONES[tone];
  const initials = (entry.displayName ?? entry.walletAddress).slice(0, 2).toUpperCase();
  return (
    <Link
      href={`/profile/${entry.walletAddress}`}
      className={`relative block aspect-square rounded-[22px] bg-gradient-to-br p-[5px] transition-transform hover:scale-[1.03] ${t.frame} ${t.glow} ${className}`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[17px] bg-zinc-900">
        {entry.avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.avatarSrc} alt={displayLabel(entry)} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 text-3xl font-black text-white/80">
            {initials}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-white/10" />
      </div>
      <span className={`absolute -left-1 -top-3 bg-gradient-to-b bg-clip-text text-4xl font-black italic leading-none text-transparent drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)] ${t.num}`}>
        {entry.rank}
      </span>
    </Link>
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
      .then((json) => { if (!controller.signal.aborted) setEntries(json.entries ?? []); })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError("Failed to load leaderboard. Please try again.");
        setEntries([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

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
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Trophy className="size-6 shrink-0 text-primary" />
          <h1 className="whitespace-nowrap text-[clamp(18px,5.4vw,26px)] font-bold leading-tight tracking-tight text-foreground">Creator Leaderboard</h1>
        </div>
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-muted-foreground">
          Top 100
        </span>
      </div>

      <PlatformStatsInline />

      {/* Period tabs */}
      <div className="mb-6 flex w-fit items-center gap-0.5 rounded-full border border-border p-1">
        <Trophy className="mx-2 size-4 text-muted-foreground" />
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`rounded-full px-3 py-1 text-[13px] font-bold transition-all ${
              period === p.key
                ? "bg-foreground text-background"
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
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/60" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-down/12 py-12 text-center text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/10 dark:text-red-400">
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
            <div className="relative mb-8 pb-2 pt-6">
              <div className="grid grid-cols-[1fr_1.15fr] items-start gap-4">
                {/* Leader */}
                <div className="pt-1">
                  <div className="flex items-start gap-2">
                    <span className="bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-[64px] font-black italic leading-[0.85] text-transparent">1</span>
                    <div className="min-w-0 pt-1">
                      <p className="truncate text-lg font-bold tracking-tight text-foreground">{displayLabel(top3[0])}</p>
                      <p className="num text-base font-bold text-up">+{fmtSol(top3[0].totalFeeSol)}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[13px] text-muted-foreground">
                    {top3[0].tokenCount} tokens · {top3[0].claimCount} claims
                  </p>
                </div>
                <div className="relative">
                  <Crown className="absolute -top-5 left-1/2 z-10 size-9 -translate-x-1/2 rotate-[8deg] fill-amber-400 text-amber-500 drop-shadow-[0_2px_6px_rgba(245,179,1,0.6)]" />
                  <FrameCard entry={top3[0]} tone="gold" className="rotate-[4deg]" />
                </div>
              </div>

              {/* #2, #3, #4 */}
              <div className="mt-5 grid grid-cols-3 gap-3">
                {[top3[1], top3[2], entries[3]].filter(Boolean).map((e, i) => (
                  <div key={e.walletAddress} className="min-w-0">
                    <FrameCard entry={e} tone={RANK_TONE[i + 1]} className={i === 0 ? "-rotate-[5deg]" : i === 1 ? "rotate-[2deg]" : "-rotate-[3deg]"} />
                    <p className="mt-2.5 truncate text-center text-[13px] font-semibold text-foreground">{displayLabel(e)}</p>
                    <p className="num truncate text-center text-xs font-bold text-up">+{fmtSol(e.totalFeeSol)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ranking list */}
          <div className="-mx-3">
            {entries.map(entry => {
              const top = entry.rank <= 3;
              const tone = top ? TONES[RANK_TONE[entry.rank - 1]] : null;
              return (
                <Link
                  key={entry.walletAddress}
                  href={`/profile/${entry.walletAddress}`}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-muted/50"
                >
                  <span className={`num w-6 shrink-0 text-center text-sm font-bold ${tone ? tone.text : "text-muted-foreground"}`}>
                    {entry.rank}
                  </span>
                  <Avatar entry={entry} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`truncate text-[15px] font-semibold ${tone ? tone.text : "text-foreground"}`}>
                        {displayLabel(entry)}
                      </span>
                      {top && <Crown className={`size-4 shrink-0 ${tone?.text ?? ""}`} />}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="rounded-lg bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {entry.tokenCount} tokens
                      </span>
                      <span className="rounded-lg bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {entry.claimCount} claims
                      </span>
                    </div>
                  </div>
                  <span className="num shrink-0 text-right text-[15px] font-bold text-up">
                    +{fmtSol(entry.totalFeeSol)}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
