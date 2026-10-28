import { describe, it, expect } from "vitest";
import { rankProjects, prizePool, tierReached, prizeTable, assignPrizes, splitVoterShare, evaluateHealth, nextTier, type ProjectMetrics } from "@/lib/hackathon/scoring";

const P = (id: string, o: Partial<ProjectMetrics> = {}): ProjectMetrics => ({ id, holders: 0, volumeUsd: 0, votes: 0, graduated: true, healthy: true, excluded: false, ...o });

describe("rankProjects", () => {
  it("weights 40% holders, 30% volume, 30% votes against the leader", () => {
    const r = rankProjects([P("a", { holders: 100, volumeUsd: 100, votes: 100 }), P("b", { holders: 50, volumeUsd: 0, votes: 0 })]);
    expect(r[0].id).toBe("a"); expect(r[0].score).toBe(100);
    expect(r[1].score).toBe(20);
  });
  it("excluded projects are left out", () => {
    expect(rankProjects([P("a", { excluded: true, holders: 9 }), P("b")]).map((x) => x.id)).toEqual(["b"]);
  });
  it("breaks ties by volume then id, and numbers ranks from 1", () => {
    const r = rankProjects([P("b", { volumeUsd: 5 }), P("a", { volumeUsd: 5 })]);
    expect(r.map((x) => [x.id, x.rank])).toEqual([["a", 1], ["b", 2]]);
  });
  it("eligibility needs graduation and health", () => {
    const r = rankProjects([P("a", { graduated: false }), P("b", { healthy: false }), P("c")]);
    expect(r.find((x) => x.id === "c")!.eligible).toBe(true);
    expect(r.find((x) => x.id === "a")!.eligible).toBe(false);
    expect(r.find((x) => x.id === "b")!.eligible).toBe(false);
  });
});

describe("prize pool and tiers", () => {
  it("is 50% of the platform fee on the volume", () => {
    expect(prizePool([{ volumeUsd: 1_000_000, platformRate: 0.0068 }])).toBe(3400);
  });
  it("needs ~28.6M of volume for 100k at 0.35%", () => {
    expect(prizePool([{ volumeUsd: 28_600_000, platformRate: 0.007 }])).toBeGreaterThan(100_000);
  });
  it("tier reached and next tier", () => {
    expect(tierReached(9_999)).toBe(0); expect(tierReached(24_999)).toBe(10_000); expect(tierReached(100_000)).toBe(100_000);
    expect(nextTier(14_820)).toBe(25_000); expect(nextTier(1_000_000)).toBeNull();
  });
  it("every fixed tier pays exactly its amount", () => {
    for (const t of [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]) {
      const sum = prizeTable(t).reduce((s, v) => s + v, 0);
      expect(Math.abs(sum - t)).toBeLessThanOrEqual(1);
    }
  });
  it("100k table: 1st 5000, 50th 1380; 25k: 50 x 500; minimum 500 from 25k up", () => {
    const t = prizeTable(100_000);
    expect(t[0]).toBe(5000); expect(t[49]).toBe(1380); expect(t).toHaveLength(50);
    expect(prizeTable(25_000)).toEqual(Array(50).fill(500));
    expect(Math.min(...prizeTable(50_000))).toBeGreaterThanOrEqual(500);
    expect(prizeTable(50_000)[0]).toBe(3500);
  });
  it("above 100k the table scales", () => {
    expect(prizeTable(250_000)[0]).toBe(12_500);
  });
  it("below 10k pays 1000 per project while the pool lasts", () => {
    expect(prizeTable(3_400)).toEqual([1000, 1000, 1000]);
    expect(prizeTable(800)).toEqual([]);
  });
  it("only eligible projects receive a prize, in rank order", () => {
    const ranked = rankProjects([P("a", { holders: 10, healthy: false }), P("b", { holders: 5 }), P("c", { holders: 1 })]);
    const prizes = assignPrizes(ranked, 10_000);
    expect(prizes.has("a")).toBe(false);
    expect(prizes.get("b")).toBe(1000); expect(prizes.get("c")).toBe(1000);
  });
});

describe("voter share", () => {
  it("gives 20% of the prize to voters, pro rata", () => {
    const out = splitVoterShare(5000, new Map([["w1", 75], ["w2", 25]]));
    expect(out.get("w1")).toBe(750); expect(out.get("w2")).toBe(250);
  });
  it("pays nobody when there are no votes", () => {
    expect(splitVoterShare(5000, new Map()).size).toBe(0);
  });
});

describe("evaluateHealth", () => {
  const ok = { holders: 300, top10Pct: 30, biggestPct: 3, bundlePct: 4, priceRatio: 0.8, hadVolume7d: true, frozenIntact: true };
  it("passes a healthy token", () => expect(evaluateHealth(ok).healthy).toBe(true));
  it("lists every failing reason", () => {
    const r = evaluateHealth({ ...ok, holders: 20, bundlePct: 11, frozenIntact: false });
    expect(r.healthy).toBe(false); expect(r.reasons).toEqual(["holders", "bundle", "frozen_tokens"]);
  });
  it("an unmeasured price does not fail the token", () => expect(evaluateHealth({ ...ok, priceRatio: null }).healthy).toBe(true));
});
