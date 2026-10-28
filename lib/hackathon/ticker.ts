import type { BoardRow } from "./leaderboard";

/** Top 20 du hackathon (volume et votes réunis) : bandeau qui défile en haut de l'accueil. */
export function topTwenty(rows: BoardRow[]): BoardRow[] {
  const byVol = [...rows].sort((a, b) => b.volumeUsd - a.volumeUsd).map((r) => r.projectId);
  const byVotes = [...rows].sort((a, b) => b.votes - a.votes).map((r) => r.projectId);
  return [...rows]
    .map((r) => ({ r, k: byVol.indexOf(r.projectId) + byVotes.indexOf(r.projectId) }))
    .sort((a, b) => a.k - b.k || b.r.volumeUsd - a.r.volumeUsd)
    .slice(0, 20).map((x) => x.r);
}

