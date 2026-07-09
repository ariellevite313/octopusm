"use client";

/**
 * LiveScore — widget de score en temps réel pour les marchés sportifs.
 *
 * - Poll /api/sports/match/[id] toutes les 60 s (uniquement si le match n'est pas terminé)
 * - Affiche : équipes, score, statut (Live / Finished / Upcoming)
 * - S'arrête de poll quand finished === true (économie de requêtes)
 * - Aucun JWT ni secret exposé côté client
 */

import { useEffect, useRef, useState } from "react";

interface MatchScore {
  id: number;
  home_score: number;
  away_score: number;
  finished: boolean;
  type: string;
  group: string;
  local_date: string;
}

interface LiveScoreProps {
  matchId: number;
  /** Nom de l'équipe à domicile (depuis le marché) */
  homeName?: string;
  /** Nom de l'équipe à l'extérieur (depuis le marché) */
  awayName?: string;
}

const POLL_INTERVAL_MS = 60_000; // 60 secondes

function stageLabel(type: string, group: string): string {
  const map: Record<string, string> = {
    group: `Group ${group}`,
    r32: "Round of 32",
    r16: "Round of 16",
    qf: "Quarterfinal",
    sf: "Semifinal",
    third: "3rd Place",
    final: "Final",
  };
  return map[type] ?? type.toUpperCase();
}

export function LiveScore({ matchId, homeName = "Home", awayName = "Away" }: LiveScoreProps) {
  const [score, setScore] = useState<MatchScore | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "finished" | "upcoming" | "error">("loading");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchScore() {
    try {
      const res = await fetch(`/api/sports/match/${matchId}`, {
        // Cache navigateur 55 s — légèrement sous le TTL serveur pour éviter les stales
        next: { revalidate: 55 },
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = (await res.json()) as MatchScore;
      setScore(data);

      const now = new Date();
      const matchDate = data.local_date ? new Date(data.local_date) : null;

      if (data.finished) {
        setStatus("finished");
        // Arrêt du polling — le match est terminé
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else if (matchDate && now < matchDate) {
        setStatus("upcoming");
      } else {
        setStatus("live");
      }
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    fetchScore();

    // Poll toutes les 60 s
    intervalRef.current = setInterval(fetchScore, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  if (status === "loading") {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 animate-pulse">
        <div className="h-4 w-32 rounded bg-muted" />
      </div>
    );
  }

  if (status === "error" || !score) {
    return null; // Silencieux — ne pas casser l'UI si l'API est down
  }

  const isLive = status === "live";
  const isFinished = status === "finished";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {score ? stageLabel(score.type, score.group) : "Match"}
        </span>
        {isLive && (
          <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 dark:bg-red-950/20 dark:text-red-400">
            <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
        )}
        {isFinished && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Full time
          </span>
        )}
        {status === "upcoming" && (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 dark:bg-blue-950/20 dark:text-blue-400">
            {score.local_date}
          </span>
        )}
      </div>

      {/* Score */}
      <div className="flex items-center justify-between gap-4">
        {/* Home */}
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="line-clamp-2 text-center text-sm font-semibold leading-tight">
            {homeName}
          </span>
        </div>

        {/* Score display */}
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-3xl font-bold tabular-nums leading-none ${isLive ? "text-red-600 dark:text-red-400" : ""}`}>
            {score.home_score}
          </span>
          <span className="text-lg font-light text-muted-foreground">–</span>
          <span className={`text-3xl font-bold tabular-nums leading-none ${isLive ? "text-red-600 dark:text-red-400" : ""}`}>
            {score.away_score}
          </span>
        </div>

        {/* Away */}
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="line-clamp-2 text-center text-sm font-semibold leading-tight">
            {awayName}
          </span>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        {isLive && "Updated every 60s"}
        {isFinished && "Final result"}
        {status === "upcoming" && `Scheduled: ${score.local_date}`}
      </p>
    </div>
  );
}
