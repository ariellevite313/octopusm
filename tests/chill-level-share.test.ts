import { describe, expect, it } from "vitest";
import { chillShareBps, chillSharePct, feeSplit } from "@/lib/swap/chill";
import { levelOfTotal } from "@/lib/octo-levels";

describe("Chill ton sac : part du détenteur selon le niveau", () => {
  it("va de 10 % (aucun niveau, Bleu) à 40 % (Rouge)", () => {
    expect([-1, 0, 1, 2, 3, 4].map(chillSharePct)).toEqual([10, 10, 20, 27, 33, 40]);
    expect(chillShareBps(9)).toBe(12);
  });
  it("répartit les 30 bps entre Jupiter et le détenteur", () => {
    expect(feeSplit(30, true, chillShareBps(0))).toEqual({ jupBps: 27, refBps: 3 });
    expect(feeSplit(30, true, chillShareBps(4))).toEqual({ jupBps: 18, refBps: 12 });
    expect(feeSplit(30, true, 99)).toEqual({ jupBps: 18, refBps: 12 });
    expect(feeSplit(3, true, 12)).toEqual({ jupBps: 3, refBps: 0 });
  });
  it("calcule le niveau d'après le total d'Omero", () => {
    expect([0, 999, 1000, 5001, 20_000, 50_001].map(levelOfTotal)).toEqual([-1, -1, 0, 1, 2, 4]);
  });
});
