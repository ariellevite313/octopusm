import { describe, it, expect } from "vitest";
import { concentration, detectBundle, packBubbles } from "@/lib/holders-analysis";

describe("concentration", () => {
  it("exclut le pool/programme du top 10 et du plus gros holder", () => {
    const rows = [
      { owner: "pool", pct: 60, isProgram: true },
      { owner: "a", pct: 10, isProgram: false },
      { owner: "b", pct: 5, isProgram: false },
    ];
    const c = concentration(rows);
    expect(c.top10).toBe(15);
    expect(c.biggest?.owner).toBe("a");
    expect(c.poolPct).toBe(60);
    expect(c.count).toBe(2);
  });
  it("ne plante pas sans holders", () => {
    expect(concentration([])).toEqual({ top10: 0, biggest: null, poolPct: 0, count: 0 });
  });
});

describe("detectBundle", () => {
  const bal = new Map([["w1", 2], ["w2", 3], ["late", 9], ["cr", 4]]);
  it("regroupe les acheteurs des premiers blocs, hors créateur et hors échecs", () => {
    const r = detectBundle([
      { slot: 100, signer: "cr", ok: true },
      { slot: 100, signer: "w1", ok: true },
      { slot: 102, signer: "w2", ok: true },
      { slot: 102, signer: "bad", ok: false },
      { slot: 500, signer: "late", ok: true },
    ], "cr", bal);
    expect(r.wallets.sort()).toEqual(["w1", "w2"]);
    expect(r.pct).toBe(5);
  });
  it("aucune transaction → 0", () => {
    expect(detectBundle([], null, bal)).toEqual({ wallets: [], pct: 0 });
  });
});

describe("packBubbles", () => {
  it("aucun chevauchement et le plus gros au centre", () => {
    const b = packBubbles([{ owner: "a", pct: 40 }, { owner: "b", pct: 20 }, { owner: "c", pct: 5 }, { owner: "d", pct: 1 }]);
    expect(b[0].owner).toBe("a");
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++)
      expect(Math.hypot(b[i].x - b[j].x, b[i].y - b[j].y)).toBeGreaterThanOrEqual(b[i].r + b[j].r);
  });
});

import { buildClusters } from "@/lib/holders-analysis";
describe("buildClusters", () => {
  it("regroupe les portefeuilles reliés et additionne leur part", () => {
    const { clusters, of } = buildClusters(
      [{ owner: "a", pct: 3 }, { owner: "b", pct: 2 }, { owner: "c", pct: 1 }, { owner: "d", pct: 9 }, { owner: "x", pct: 5 }],
      [{ a: "a", b: "b" }, { a: "b", b: "c" }, { a: "d", b: "ghost" }],
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].supply).toBe(6);
    expect(of.get("c")).toBe(0);
    expect(of.has("x")).toBe(false);
  });
});
