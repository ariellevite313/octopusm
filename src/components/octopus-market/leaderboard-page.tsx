/**
 * leaderboard-page.tsx
 * Classement OCTO — total OCTO cumule (paris + parrainage), all-time.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, RefreshCw, AlertCircle, Medal } from "lucide-react";
import { formatWalletAddress } from "@/components/octopus-market/solana-wallet";
import { OctoBadge, AdminBadge } from "@/components/octopus-market/octo-tier-badge";
import { predictionMarketTreasuryAddress } from "@/components/octopus-market/octopus-market-data";
import {
  getLeaderboard,
  getWalletLeaderboardRank,
  type LeaderboardEntry,
} from "@/services/supabase/leaderboard-service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MIN_SKELETON_MS = 600;

function MedalBadge({ rank }: { rank: 2 | 3 }) {
  const isSecond = rank === 2;
  const bg     = isSecond ? "#D1D5DB" : "#D4956A";
  const border = isSecond ? "#9CA3AF" : "#A0693A";
  const ribbon = isSecond ? "#94A3B8" : "#C2763A";
  const outer  = "10,1 24,1 33,10 33,24 24,33 10,33 1,24 1,10";
  const inner  = "10,3 24,3 31,10 31,24 24,31 10,31 3,24 3,10";
  return (
    <svg width="20" height="26" viewBox="0 0 34 44" aria-hidden="true">
      <path d="M9 32 L9 44 L17 38 L25 44 L25 32 Z" fill={ribbon} />
      <polygon points={outer} fill={border} />
      <polygon points={inner} fill={bg} />
      <text x="17" y="17" textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="700" fill="white" fontFamily="system-ui, sans-serif">{rank}</text>
    </svg>
  );
}

function formatOcto(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}


// ─── Avatar ───────────────────────────────────────────────────────────────────

function EntryAvatar({ entry }: { entry: LeaderboardEntry }) {
  const label = entry.display_name
    ? entry.display_name.slice(0, 2).toUpperCase()
    : formatWalletAddress(entry.wallet_address).slice(0, 2).toUpperCase();

  if (entry.avatar_src) {
    return (
      <img
        src={entry.avatar_src}
        alt={label}
        className="size-10 shrink-0 rounded-full object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-pink-600 text-sm font-semibold text-white">
      {label}
    </span>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function LeaderboardRow({
  entry,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
        isCurrentUser
          ? "border border-orange-300 bg-orange-50 dark:border-orange-400/30 dark:bg-orange-500/10"
          : entry.rank <= 3
          ? "bg-zinc-50 dark:bg-white/5"
          : "hover:bg-zinc-50 dark:hover:bg-white/5"
      }`}
    >
      <div className="w-8 shrink-0 text-center">
        {entry.rank === 1 ? (
          <span className="text-xl leading-none">🏆</span>
        ) : entry.rank === 2 ? (
          <MedalBadge rank={2} />
        ) : entry.rank === 3 ? (
          <MedalBadge rank={3} />
        ) : (
          <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
            #{entry.rank}
          </span>
        )}
      </div>

      <EntryAvatar entry={entry} />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm font-semibold text-zinc-900 dark:text-white">
          <span className="truncate">
            {entry.display_name ?? formatWalletAddress(entry.wallet_address)}
          </span>
          {entry.wallet_address === predictionMarketTreasuryAddress
            ? <AdminBadge size={14} />
            : <OctoBadge totalOcto={entry.total_octo} size={14} />
          }
        </p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {entry.win_count} win{entry.win_count !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
          {formatOcto(entry.total_octo)}
        </p>
        <p className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          OCTO
        </p>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LeaderboardSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5"
        >
          <div className="size-8 animate-pulse rounded-full bg-zinc-100 dark:bg-white/10" />
          <div className="size-10 animate-pulse rounded-full bg-zinc-100 dark:bg-white/10" style={{ animationDelay: `${i * 60}ms` }} />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 animate-pulse rounded-full bg-zinc-100 dark:bg-white/10" style={{ animationDelay: `${i * 60 + 30}ms` }} />
            <div className="h-2 w-16 animate-pulse rounded-full bg-zinc-100 dark:bg-white/10" style={{ animationDelay: `${i * 60 + 60}ms` }} />
          </div>
          <div className="h-4 w-14 animate-pulse rounded-full bg-zinc-100 dark:bg-white/10" />
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LeaderboardPage({
  walletAddress,
}: {
  walletAddress: string | null;
}) {
  // Skeleton minimum pour eviter le flash sur fetch rapide
  const [minLoading, setMinLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setMinLoading(false), MIN_SKELETON_MS);
    return () => clearTimeout(t);
  }, []);

  const {
    data: leaderboard,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["leaderboard-octo"],
    queryFn: () => getLeaderboard(50),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const { data: myRank } = useQuery({
    queryKey: ["leaderboard-octo-me", walletAddress],
    queryFn: () =>
      walletAddress ? getWalletLeaderboardRank(walletAddress) : null,
    enabled: !!walletAddress,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const showSkeleton = isLoading || minLoading;
  const entries = leaderboard ?? [];
  const isMyRankInTop = myRank
    ? entries.some((e) => e.wallet_address === walletAddress)
    : false;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* En-tete */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-500/15">
          <Trophy className="size-5 text-orange-500" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
            OCTO Leaderboard
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Total OCTO earned (trading + referrals) — all-time
          </p>
        </div>
        {/* Indicateur de rafraichissement en arriere-plan */}
        {isFetching && !showSkeleton && (
          <RefreshCw className="size-3.5 animate-spin text-orange-400" />
        )}
      </div>

      {/* Corps */}
      {showSkeleton ? (
        <LeaderboardSkeleton />
      ) : isError ? (
        /* Etat erreur avec retry */
        <div className="rounded-xl border border-red-100 bg-red-50/50 py-10 text-center dark:border-red-400/20 dark:bg-red-500/10">
          <AlertCircle className="mx-auto mb-3 size-8 text-red-400 dark:text-red-500" />
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            Unable to load the leaderboard
          </p>
          <p className="mt-1 text-xs text-red-400 dark:text-red-500">
            Check your connection or make sure the SQL view has been created
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/30"
          >
            <RefreshCw className="size-3" />
            Retry
          </button>
        </div>
      ) : entries.length === 0 ? (
        /* Etat vide */
        <div className="rounded-xl border border-orange-100 bg-orange-50/50 py-12 text-center dark:border-white/10 dark:bg-white/5">
          <Medal className="mx-auto mb-3 size-8 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            No OCTO earnings yet
          </p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            The first winners will appear here
          </p>
        </div>
      ) : (
        /* Liste */
        <div className="space-y-1">
          {entries.map((entry) => (
            <LeaderboardRow
              key={entry.wallet_address}
              entry={entry}
              isCurrentUser={entry.wallet_address === walletAddress}
            />
          ))}
        </div>
      )}

      {/* Position du wallet connecte si hors top 50 */}
      {!showSkeleton && !isError && myRank && !isMyRankInTop && (
        <div className="space-y-1 border-t border-orange-100 pt-4 dark:border-white/10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Your position
          </p>
          <LeaderboardRow entry={myRank} isCurrentUser />
        </div>
      )}

      {/* Pas encore de gains OCTO */}
      {!showSkeleton && !isError && !myRank && walletAddress && entries.length > 0 && (
        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
          You have no OCTO earnings yet
        </p>
      )}
    </div>
  );
}
