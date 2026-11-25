import { describe, it, expect } from "vitest";
import { estimateNext30, gainsByPeriod } from "@/lib/referrals/stats";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 25, 12);

describe("gains du parrain", () => {
  const g = [{ at: now - 1000, usd: 1 }, { at: now - 3 * DAY, usd: 2 }, { at: now - 20 * DAY, usd: 4 }, { at: now - 60 * DAY, usd: 8 }];
  it("par période", () => {
    expect(gainsByPeriod(g, now)).toEqual({ today: 1, week: 3, month: 7, all: 15 });
  });
  it("estimation des 30 prochains jours au rythme récent", () => {
    // (2 * 3/7 + 7/30) / 3 * 30 ≈ 10,90
    expect(estimateNext30(g, now)).toBeCloseTo(10.9, 1);
    expect(estimateNext30([], now)).toBe(0);
  });
});
