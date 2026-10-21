/**
 * Agrégation des scores en direct avec bascule automatique :
 *  - chaque fournisseur a un rythme d'appel, un quota quotidien et un « disjoncteur » (en panne → mis de côté un moment) ;
 *  - si un fournisseur échoue ou atteint sa limite, les autres continuent d'alimenter la table live_matches ;
 *  - pour un même match, la source la plus fiable en direct l'emporte ; une source en retard ne fait jamais reculer un score.
 */
import { createAdminClient } from "@/lib/supabase/server";
import { apiFootball, footballData, worldCup, ProviderError } from "./providers";
import type { LiveMatch } from "./types";

const PRIORITY: Record<string, number> = { "api-football": 3, worldcup: 2, "football-data": 1 };
const STATUS_RANK: Record<string, number> = { scheduled: 0, postponed: 0, cancelled: 3, live: 1, halftime: 1, finished: 2 };

type State = { provider: string; day: string; calls: number; last_call: string | null; down_until: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function loadStates(db: Db): Promise<Map<string, State>> {
  const { data } = await db.from("sports_providers").select("provider, day, calls, last_call, down_until");
  const today = new Date().toISOString().slice(0, 10);
  const m = new Map<string, State>();
  for (const s of (data ?? []) as State[]) m.set(s.provider, s.day === today ? s : { ...s, day: today, calls: 0 });
  return m;
}

function ready(s: State | undefined, minIntervalMs: number, dailyLimit: number): boolean {
  const now = Date.now();
  if (!s) return true;
  if (s.down_until && Date.parse(s.down_until) > now) return false;
  if (s.calls >= dailyLimit) return false;
  return !s.last_call || now - Date.parse(s.last_call) >= minIntervalMs;
}

async function saveState(db: Db, provider: string, prev: State | undefined, patch: Partial<State> & { last_error?: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  await db.from("sports_providers").upsert({
    provider, day: today, calls: (prev?.calls ?? 0) + 1, last_call: new Date().toISOString(), down_until: null, last_error: null, ...patch,
  });
}

export async function refreshLiveScores(): Promise<{ used: string[]; failed: Record<string, string>; matches: number }> {
  const db = createAdminClient() as Db;
  const now = Date.now();
  const states = await loadStates(db);

  // Y a-t-il un match en cours ou sur le point de commencer ?
  const { data: window } = await db
    .from("live_matches").select("key, status, kickoff, source, score_home, score_away")
    .gte("kickoff", new Date(now - 2 * 86_400_000).toISOString()).lte("kickoff", new Date(now + 2 * 86_400_000).toISOString());
  const existing = new Map<string, { status: string; source: string; kickoff: string; score_home: number | null; score_away: number | null }>(
    ((window ?? []) as { key: string; status: string; source: string; kickoff: string; score_home: number | null; score_away: number | null }[]).map((r) => [r.key, r]),
  );
  const liveWindow = [...existing.values()].some((r) => r.status === "live" || r.status === "halftime" ||
    (r.status === "scheduled" && Date.parse(r.kickoff) <= now + 10 * 60_000 && Date.parse(r.kickoff) >= now - 150 * 60_000));

  const jobs: { name: string; minInterval: number; limit: number; run: () => Promise<LiveMatch[]> }[] = [];
  if (worldCup.enabled()) jobs.push({ name: worldCup.name, minInterval: 60_000, limit: worldCup.dailyLimit, run: () => worldCup.fetch() });
  if (footballData.enabled()) jobs.push({ name: footballData.name, minInterval: liveWindow ? 120_000 : 30 * 60_000, limit: footballData.dailyLimit, run: () => footballData.fetch() });
  if (apiFootball.enabled()) {
    // Offre gratuite : ~95 appels / jour → en direct toutes les 3 min, sinon le programme du jour toutes les 3 h
    jobs.push({ name: apiFootball.name, minInterval: liveWindow ? 180_000 : 3 * 3_600_000, limit: apiFootball.dailyLimit, run: () => apiFootball.fetch(liveWindow ? "live" : "today") });
  }

  const used: string[] = [];
  const failed: Record<string, string> = {};
  const fetched: LiveMatch[] = [];
  for (const j of jobs) {
    const st = states.get(j.name);
    if (!ready(st, j.minInterval, j.limit)) continue;
    try {
      const rows = await j.run();
      fetched.push(...rows);
      used.push(j.name);
      await saveState(db, j.name, st, {});
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError("unknown");
      failed[j.name] = err.message;
      // Limite atteinte → jusqu'à demain (api-football) ou 30 min ; autre panne → 5 min
      const until = err.rateLimited
        ? (j.name === apiFootball.name ? new Date(new Date().toISOString().slice(0, 10) + "T23:59:59Z") : new Date(now + 30 * 60_000))
        : new Date(now + 5 * 60_000);
      await saveState(db, j.name, st, { down_until: until.toISOString(), last_error: err.message.slice(0, 200) });
    }
  }

  // Fusion : meilleure source en direct, sans jamais faire reculer un match (ex. source en différé)
  const best = new Map<string, LiveMatch>();
  for (const m of fetched) {
    const cur = best.get(m.key);
    if (!cur || (PRIORITY[m.source] ?? 0) > (PRIORITY[cur.source] ?? 0)) {
      best.set(m.key, { ...m, home_logo: m.home_logo ?? cur?.home_logo ?? null, away_logo: m.away_logo ?? cur?.away_logo ?? null, league_logo: m.league_logo ?? cur?.league_logo ?? null });
    } else {
      cur.home_logo ??= m.home_logo; cur.away_logo ??= m.away_logo; cur.league_logo ??= m.league_logo;
    }
  }
  const upserts: (LiveMatch & { updated_at: string })[] = [];
  for (const m of best.values()) {
    const old = existing.get(m.key);
    if (old) {
      const regress = (STATUS_RANK[m.status] ?? 0) < (STATUS_RANK[old.status] ?? 0);
      const lowerSource = (PRIORITY[m.source] ?? 0) < (PRIORITY[old.source] ?? 0);
      const fewerGoals = (m.score_home ?? 0) + (m.score_away ?? 0) < (old.score_home ?? 0) + (old.score_away ?? 0);
      if (regress || (lowerSource && fewerGoals)) continue;
    }
    upserts.push({ ...m, updated_at: new Date().toISOString() });
  }
  if (upserts.length) await db.from("live_matches").upsert(upserts);
  await db.from("live_matches").delete().lt("kickoff", new Date(now - 3 * 86_400_000).toISOString());

  return { used, failed, matches: upserts.length };
}
