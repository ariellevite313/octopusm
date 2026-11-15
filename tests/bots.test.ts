import { describe, it, expect } from "vitest";
import { classify, summarizeBots } from "@/lib/bots";

describe("bot detection", () => {
  it("flags a sniper buying right at the market open", () => {
    expect(classify([1000, 5000, 9000], 995)).toBe("sniper");
    expect(classify([1100], 995)).toBe(null);
  });
  it("flags machine rhythm and bursts", () => {
    expect(classify(Array.from({ length: 20 }, (_, i) => 10_000 + i * 300), null)).toBe("bot");
    expect(classify(Array.from({ length: 30 }, (_, i) => 10_000 + i * 60 + (i % 3) * 17), null)).toBe("bot");
  });
  it("leaves human-looking activity alone", () => {
    expect(classify([10_000, 13_700, 40_000, 41_000, 90_000, 200_000, 205_000, 400_000, 401_000, 700_000, 900_000, 950_000], null)).toBe(null);
    expect(classify([10_000, 20_000], null)).toBe(null);
  });
  it("never counts OM AI wallets", () => {
    const r = summarizeBots([{ owner: "AI1", kind: "bot", pct: 2 }, { owner: "X", kind: "sniper", pct: 3 }], new Set(["AI1"]));
    expect(r.wallets.map((w) => w.owner)).toEqual(["X"]);
    expect(r.pct).toBe(3);
  });
});
