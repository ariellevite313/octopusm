/**
 * Fournisseurs de scores (côté serveur uniquement, clés dans .env) :
 *  - api-football   : APISPORTS_KEY        — direct, offre gratuite 100 appels / jour
 *  - football-data  : FOOTBALL_DATA_TOKEN  — 12 grandes compétitions, offre gratuite en différé, 10 appels / min
 *  - worldcup       : WORLDCUP_API_TOKEN   — Coupe du monde 2026 (déjà utilisé par le site)
 */
import { matchKey, type LiveMatch, type MatchStatus } from "./types";
import { getAllMatches, getTeams } from "@/lib/worldcup/client";

export class ProviderError extends Error {
  constructor(message: string, public rateLimited = false) { super(message); }
}

const TIMEOUT = 10_000;
async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers, cache: "no-store", signal: ctl.signal });
    if (r.status === 429) throw new ProviderError("rate limited", true);
    if (!r.ok) throw new ProviderError(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(e instanceof Error ? e.message : "network error");
  } finally { clearTimeout(t); }
}

// ── API-Football ──────────────────────────────────────────────────────────────
const AF_STATUS: Record<string, MatchStatus> = {
  TBD: "scheduled", NS: "scheduled", "1H": "live", HT: "halftime", "2H": "live", ET: "live", BT: "live", P: "live", LIVE: "live", INT: "live", SUSP: "live",
  FT: "finished", AET: "finished", PEN: "finished", AWD: "finished", WO: "finished", PST: "postponed", CANC: "cancelled", ABD: "cancelled",
};
type AfFixture = {
  fixture: { date: string; status: { short: string; elapsed: number | null } };
  league: { name: string; logo: string | null };
  teams: { home: { name: string; logo: string | null }; away: { name: string; logo: string | null } };
  goals: { home: number | null; away: number | null };
};

export const apiFootball = {
  name: "api-football",
  dailyLimit: 95,
  enabled: () => !!process.env.APISPORTS_KEY,
  async fetch(mode: "live" | "today"): Promise<LiveMatch[]> {
    const q = mode === "live" ? "live=all" : `date=${new Date().toISOString().slice(0, 10)}`;
    const j = (await getJson(`https://v3.football.api-sports.io/fixtures?${q}`, { "x-apisports-key": process.env.APISPORTS_KEY! })) as { response?: AfFixture[]; errors?: unknown };
    const errs = j.errors && typeof j.errors === "object" ? Object.values(j.errors as Record<string, string>) : [];
    if (errs.length) throw new ProviderError(String(errs[0]), /limit|request/i.test(String(errs[0])));
    return (j.response ?? []).map((f) => ({
      key: matchKey(f.fixture.date, f.teams.home.name, f.teams.away.name),
      league: f.league.name, league_logo: f.league.logo,
      home: f.teams.home.name, home_logo: f.teams.home.logo, away: f.teams.away.name, away_logo: f.teams.away.logo,
      score_home: f.goals.home, score_away: f.goals.away,
      status: AF_STATUS[f.fixture.status.short] ?? "scheduled", minute: f.fixture.status.elapsed,
      kickoff: new Date(f.fixture.date).toISOString(), source: "api-football",
    }));
  },
};

// ── football-data.org ─────────────────────────────────────────────────────────
const FD_STATUS: Record<string, MatchStatus> = {
  SCHEDULED: "scheduled", TIMED: "scheduled", IN_PLAY: "live", PAUSED: "halftime", EXTRA_TIME: "live", PENALTY_SHOOTOUT: "live",
  FINISHED: "finished", AWARDED: "finished", POSTPONED: "postponed", SUSPENDED: "live", CANCELLED: "cancelled",
};
type FdMatch = {
  utcDate: string; status: string; minute?: number | null;
  competition: { name: string; emblem: string | null };
  homeTeam: { name: string; shortName?: string; crest: string | null };
  awayTeam: { name: string; shortName?: string; crest: string | null };
  score: { fullTime: { home: number | null; away: number | null } };
};

export const footballData = {
  name: "football-data",
  dailyLimit: 5000,
  enabled: () => !!process.env.FOOTBALL_DATA_TOKEN,
  async fetch(): Promise<LiveMatch[]> {
    const d = new Date();
    const from = new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10);
    const to = new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);
    const j = (await getJson(`https://api.football-data.org/v4/matches?dateFrom=${from}&dateTo=${to}`, { "X-Auth-Token": process.env.FOOTBALL_DATA_TOKEN! })) as { matches?: FdMatch[] };
    return (j.matches ?? []).map((m) => ({
      key: matchKey(m.utcDate, m.homeTeam.name, m.awayTeam.name),
      league: m.competition.name, league_logo: m.competition.emblem,
      home: m.homeTeam.shortName || m.homeTeam.name, home_logo: m.homeTeam.crest, away: m.awayTeam.shortName || m.awayTeam.name, away_logo: m.awayTeam.crest,
      score_home: m.score.fullTime.home, score_away: m.score.fullTime.away,
      status: FD_STATUS[m.status] ?? "scheduled", minute: m.minute ?? null,
      kickoff: new Date(m.utcDate).toISOString(), source: "football-data",
    }));
  },
};

// ── Coupe du monde 2026 (API déjà utilisée) ───────────────────────────────────
export const worldCup = {
  name: "worldcup",
  dailyLimit: 5000,
  enabled: () => !!process.env.WORLDCUP_API_TOKEN,
  async fetch(): Promise<LiveMatch[]> {
    const [games, teams] = await Promise.all([getAllMatches(), getTeams()]);
    if (!games.length) throw new ProviderError("no data");
    const byId = new Map(teams.map((t) => [t.id, t]));
    const now = Date.now();
    const out: LiveMatch[] = [];
    for (const g of games) {
      const t = Date.parse(g.local_date);
      if (!Number.isFinite(t) || Math.abs(t - now) > 2 * 86_400_000) continue;
      const h = byId.get(g.home_team_id), a2 = byId.get(g.away_team_id);
      const home = h?.name_en ?? g.home_team_label, away = a2?.name_en ?? g.away_team_label;
      if (!home || !away) continue;
      const finished = g.finished === "TRUE";
      const kickoff = new Date(t).toISOString();
      const live = !finished && now >= t && now <= t + 2.25 * 3_600_000;
      out.push({
        key: matchKey(kickoff, home, away),
        league: "FIFA World Cup", league_logo: null,
        home, home_logo: h?.flag || null, away, away_logo: a2?.flag || null,
        score_home: finished || live ? g.home_score ?? 0 : null, score_away: finished || live ? g.away_score ?? 0 : null,
        status: finished ? "finished" : live ? "live" : "scheduled", minute: null, kickoff, source: "worldcup",
      });
    }
    return out;
  },
};
