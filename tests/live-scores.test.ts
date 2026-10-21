import { describe, it, expect, vi, beforeEach } from "vitest";

const tables: Record<string, Record<string, unknown>[]> = { live_matches: [], sports_providers: [] };
const upserts: Record<string, Record<string, unknown>[]> = {};
function chain(table: string) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  q.select = self; q.gte = self; q.lte = self; q.lt = self; q.eq = self;
  q.then = (res: (v: unknown) => void) => res({ data: tables[table] });
  q.upsert = async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
    const list = Array.isArray(rows) ? rows : [rows];
    upserts[table] = [...(upserts[table] ?? []), ...list];
    const pk = table === "live_matches" ? "key" : "provider";
    for (const r of list) { const i = tables[table].findIndex((x) => x[pk] === r[pk]); if (i >= 0) tables[table][i] = { ...tables[table][i], ...r }; else tables[table].push(r); }
    return { error: null };
  };
  q.delete = () => ({ lt: async () => ({ error: null }) });
  return q;
}
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createAdminClient: () => ({ from: chain }) }));

const kickoff = new Date(Date.now() - 30 * 60_000).toISOString();
const base = { league: "Ligue 1", league_logo: null, home: "PSG", home_logo: null, away: "OM", away_logo: null, minute: 30, kickoff };
const mocks = {
  af: vi.fn(), fd: vi.fn(), wc: vi.fn(),
};
vi.mock("@/lib/sports/providers", async () => {
  class ProviderError extends Error { constructor(m: string, public rateLimited = false) { super(m); } }
  return {
    ProviderError,
    apiFootball: { name: "api-football", dailyLimit: 95, enabled: () => true, fetch: (...a: unknown[]) => mocks.af(...a) },
    footballData: { name: "football-data", dailyLimit: 5000, enabled: () => true, fetch: () => mocks.fd() },
    worldCup: { name: "worldcup", dailyLimit: 5000, enabled: () => false, fetch: () => mocks.wc() },
  };
});

const { refreshLiveScores } = await import("../lib/sports/live");
const { ProviderError } = await import("@/lib/sports/providers");
const { matchKey } = await import("../lib/sports/types");

beforeEach(() => { tables.live_matches = []; tables.sports_providers = []; for (const k in upserts) delete upserts[k]; mocks.af.mockReset(); mocks.fd.mockReset(); });

describe("live scores failover", () => {
  it("when the main provider hits its limit, the other one still feeds the scores and the main one is paused", async () => {
    mocks.af.mockRejectedValue(new ProviderError("limit reached", true));
    mocks.fd.mockResolvedValue([{ ...base, key: matchKey(kickoff, "PSG", "OM"), score_home: 1, score_away: 0, status: "live", source: "football-data" }]);
    const r = await refreshLiveScores();
    expect(r.used).toEqual(["football-data"]);
    expect(r.failed["api-football"]).toMatch(/limit/);
    expect(tables.live_matches[0]).toMatchObject({ score_home: 1, source: "football-data" });
    const af = tables.sports_providers.find((p) => p.provider === "api-football")!;
    expect(Date.parse(String(af.down_until))).toBeGreaterThan(Date.now());
  });

  it("the live source wins and a delayed source never moves a score backwards", async () => {
    const key = matchKey(kickoff, "PSG", "OM");
    tables.live_matches = [{ ...base, key, score_home: 2, score_away: 1, status: "live", source: "api-football" }];
    tables.sports_providers = [{ provider: "api-football", day: new Date().toISOString().slice(0, 10), calls: 1, last_call: new Date().toISOString(), down_until: null }];
    mocks.fd.mockResolvedValue([{ ...base, key, score_home: 1, score_away: 1, status: "live", source: "football-data" }]);
    await refreshLiveScores();
    expect(tables.live_matches[0]).toMatchObject({ score_home: 2, score_away: 1, source: "api-football" });
  });

  it("team names are matched across providers", () => {
    expect(matchKey(kickoff, "Paris Saint-Germain FC", "Olympique de Marseille")).toBe(matchKey(kickoff, "Paris Saint Germain", "Olympique Marseille"));
  });
});
