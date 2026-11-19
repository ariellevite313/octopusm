import { describe, expect, it } from "vitest";
import { fromCandles, hasPeriod, isSource } from "@/lib/top-lists";

const D = 86_400_000;
describe("top 10", () => {
  it("variation et volume depuis les bougies journalières", () => {
    const now = 40 * D;
    const c: [number, number, number, number][] = Array.from({ length: 31 }, (_, i) => [now - (30 - i) * D, 100 + i, 101 + i, 10]);
    const w = fromCandles(c, 7, now);
    expect(w.volume).toBe(80); // 8 bougies (la bougie de début incluse)
    expect(w.change).toBeCloseTo((131 / 123 - 1) * 100);
    expect(fromCandles([], 7, now)).toEqual({ change: null, volume: 0 });
  });
  it("sources et périodes", () => {
    expect(isSource("om")).toBe(true);
    expect(isSource("solana")).toBe(true);
    expect(isSource("arc")).toBe(false);
    expect(hasPeriod("mcap")).toBe(false);
    expect(hasPeriod("losers")).toBe(true);
  });
});
