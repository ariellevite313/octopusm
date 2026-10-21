export type MatchStatus = "scheduled" | "live" | "halftime" | "finished" | "postponed" | "cancelled";

export type LiveMatch = {
  key: string;
  league: string | null;
  league_logo: string | null;
  home: string;
  home_logo: string | null;
  away: string;
  away_logo: string | null;
  score_home: number | null;
  score_away: number | null;
  status: MatchStatus;
  minute: number | null;
  kickoff: string;
  source: string;
};

/** Clé commune à tous les fournisseurs : jour UTC + noms d'équipes simplifiés. */
export function matchKey(kickoffIso: string, home: string, away: string): string {
  return `${kickoffIso.slice(0, 10)}:${normTeam(home)}:${normTeam(away)}`;
}

export function normTeam(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|afc|sc|ac|cd|ssc|as|club|de|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}
