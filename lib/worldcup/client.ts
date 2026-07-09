/**
 * Client World Cup 2026 API — SERVER-SIDE ONLY
 * Ne jamais importer ce fichier dans un composant client ("use client").
 * Le JWT est lu depuis les variables d'environnement serveur.
 *
 * API : https://worldcup26.ir
 * Docs : https://worldcup26.ir/api-docs/
 */

const BASE_URL = "https://worldcup26.ir";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorldCupTeam {
  id: string;
  name_en: string;
  name_fa: string;
  fifa_code: string;
  groups: string;
  flag: string;
}

export interface WorldCupMatch {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  group: string;
  matchday: string;
  local_date: string;
  persian_date: string;
  stadium_id: string;
  finished: string; // "TRUE" | "FALSE"
  type: string;
  home_team_label: string;
  away_team_label: string;
}

/** Réponse filtrée exposée au client — aucun token, aucune donnée interne */
export interface MatchScore {
  id: number;
  home_score: number;
  away_score: number;
  finished: boolean;
  type: string;
  group: string;
  local_date: string;
}

/** Match enrichi avec les noms d'équipes (usage admin uniquement) */
export interface MatchWithTeams extends MatchScore {
  home_team_name: string;
  away_team_name: string;
  home_team_label: string;
  away_team_label: string;
}

// ─── Cache serveur (en mémoire) ──────────────────────────────────────────────

const SCORE_CACHE_TTL  = 60_000;   // 60 s  — données live
const TEAMS_CACHE_TTL  = 3_600_000; // 1 h  — données statiques
const GAMES_CACHE_TTL  = 3_600_000; // 1 h  — planning ne change pas

interface CacheEntry<T> { data: T; expires: number }

const scoreCache = new Map<number, CacheEntry<MatchScore>>();
let teamsCache:  CacheEntry<WorldCupTeam[]>  | null = null;
let gamesCache:  CacheEntry<WorldCupMatch[]> | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToken(): string | null {
  return process.env.WORLDCUP_API_TOKEN ?? null;
}

async function apiFetch<T>(path: string, _ttlOverride?: number): Promise<T | null> {
  const token = getToken();
  if (!token) {
    console.error("[worldcup] WORLDCUP_API_TOKEN manquant dans les variables d'environnement");
    return null;
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      // On gère le cache nous-mêmes — pas de cache Next.js ici
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[worldcup] ${path} → HTTP ${res.status}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    console.error(`[worldcup] fetch error on ${path}:`, err);
    return null;
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Valide qu'un match_id est un entier entre 1 et 104.
 * Utilisé à la fois côté route API et côté client pour rejeter les entrées malveillantes.
 */
export function isValidMatchId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id >= 1 && id <= 104;
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Récupère le score d'un match par son ID (1–104).
 * Résultat mis en cache 60 s côté serveur.
 * Retourne null si l'ID est invalide ou si l'API est indisponible.
 */
export async function getMatchScore(matchId: number): Promise<MatchScore | null> {
  if (!isValidMatchId(matchId)) return null;

  // Hit cache
  const cached = scoreCache.get(matchId);
  if (cached && Date.now() < cached.expires) return cached.data;

  const raw = await apiFetch<WorldCupMatch>(`/get/game/${matchId}`);
  if (!raw) return null;

  const score: MatchScore = {
    id:         parseInt(raw.id, 10),
    home_score: raw.home_score ?? 0,
    away_score: raw.away_score ?? 0,
    finished:   raw.finished === "TRUE",
    type:       raw.type,
    group:      raw.group,
    local_date: raw.local_date,
  };

  scoreCache.set(matchId, { data: score, expires: Date.now() + SCORE_CACHE_TTL });
  return score;
}

/**
 * Récupère la liste des équipes (mise en cache 1 h).
 */
export async function getTeams(): Promise<WorldCupTeam[]> {
  if (teamsCache && Date.now() < teamsCache.expires) return teamsCache.data;

  const data = await apiFetch<WorldCupTeam[]>("/get/teams", TEAMS_CACHE_TTL);
  if (!data) return [];

  teamsCache = { data, expires: Date.now() + TEAMS_CACHE_TTL };
  return data;
}

/**
 * Récupère tous les matchs (mise en cache 1 h).
 */
export async function getAllMatches(): Promise<WorldCupMatch[]> {
  if (gamesCache && Date.now() < gamesCache.expires) return gamesCache.data;

  const data = await apiFetch<WorldCupMatch[]>("/get/games", GAMES_CACHE_TTL);
  if (!data) return [];

  gamesCache = { data, expires: Date.now() + GAMES_CACHE_TTL };
  return data;
}

/**
 * Retourne tous les matchs enrichis avec les noms d'équipes.
 * Usage réservé à l'admin (sélecteur de match).
 */
export async function getAllMatchesWithTeams(): Promise<MatchWithTeams[]> {
  const [matches, teams] = await Promise.all([getAllMatches(), getTeams()]);

  const teamById = new Map(teams.map((t) => [t.id, t]));

  return matches.map((m) => {
    const home = teamById.get(m.home_team_id);
    const away = teamById.get(m.away_team_id);

    return {
      id:              parseInt(m.id, 10),
      home_score:      m.home_score ?? 0,
      away_score:      m.away_score ?? 0,
      finished:        m.finished === "TRUE",
      type:            m.type,
      group:           m.group,
      local_date:      m.local_date,
      home_team_name:  home?.name_en ?? m.home_team_label ?? `Team ${m.home_team_id}`,
      away_team_name:  away?.name_en ?? m.away_team_label ?? `Team ${m.away_team_id}`,
      home_team_label: m.home_team_label,
      away_team_label: m.away_team_label,
    };
  });
}
