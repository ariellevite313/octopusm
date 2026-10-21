/** Résultat suggéré à l'admin pour un pool lié à un match terminé (jamais appliqué automatiquement). */
import { normTeam } from "./types";

type Opt = { id: string; label: string };
type Match = { home: string; away: string; score_home: number | null; score_away: number | null; status: string };

const DRAW = /^(draw|tie|x|nul|match nul|empate|pareggio|unentschieden|berabere|ничья|平局|تعادل)$/i;

export function suggestOutcome(m: Match | null, options: Opt[]): { optionId: string; label: string; outcome: "home" | "draw" | "away" } | null {
  if (!m || m.status !== "finished" || m.score_home == null || m.score_away == null) return null;
  const outcome = m.score_home > m.score_away ? "home" : m.score_home < m.score_away ? "away" : "draw";
  const home = normTeam(m.home), away = normTeam(m.away);
  const matches = options.filter((o) => {
    const n = normTeam(o.label);
    if (outcome === "draw") return DRAW.test(o.label.trim());
    const t = outcome === "home" ? home : away;
    const other = outcome === "home" ? away : home;
    if (!n || !t) return false;
    // Le libellé doit désigner l'équipe gagnante et pas l'autre
    return (n.includes(t) || t.includes(n)) && !(other && (n.includes(other) || other.includes(n)));
  });
  return matches.length === 1 ? { optionId: matches[0].id, label: matches[0].label, outcome } : null;
}
