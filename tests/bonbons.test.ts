import { describe, it, expect } from "vitest";
import { splitBonbons, bonbonsValue } from "@/lib/bonbons";

describe("bonbons", () => {
  it("blanc = 10, orange = 100", () => {
    expect(splitBonbons(10)).toEqual({ orange: 0, white: 1 });
    expect(splitBonbons(100)).toEqual({ orange: 1, white: 0 });
    expect(splitBonbons(250)).toEqual({ orange: 2, white: 5 });
    expect(splitBonbons(500)).toEqual({ orange: 5, white: 0 });
  });
  it("ignore le reste sous 10 et les valeurs invalides", () => {
    expect(splitBonbons(9)).toEqual({ orange: 0, white: 0 });
    expect(splitBonbons(-5)).toEqual({ orange: 0, white: 0 });
    expect(splitBonbons(NaN)).toEqual({ orange: 0, white: 0 });
  });
  it("valeur de bonbons", () => { expect(bonbonsValue(2, 3)).toBe(230); });
});
