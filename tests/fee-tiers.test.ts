import { describe, it, expect } from "vitest";
import { creatorEarnLabel, feeTierOf, SOL_FEE_TIERS } from "@/lib/launch/fee-tiers";
import { SOL_PLATFORM_RATE } from "@/lib/trade-rewards";

describe("niveaux de frais Solana (affichage)", () => {
  it("niveau réduit : le créateur gagne 0,5 % et le trader paie 1,25 %", () => {
    expect(creatorEarnLabel("low")).toBe("0.5%");
    expect(SOL_FEE_TIERS.low.total).toBe("1.25%");
  });
  it("niveau standard ou valeur absente : 0,9 % pour le créateur, 2 % au total", () => {
    for (const v of ["standard", null, undefined, "", "weird"]) expect(creatorEarnLabel(v)).toBe("0.9%");
    expect(SOL_FEE_TIERS.standard.total).toBe("2%");
    expect(feeTierOf("low")).toBe("low");
    expect(feeTierOf("anything")).toBe("standard");
  });
  it("cohérent avec les taux de la plateforme utilisés pour les gains", () => {
    // réduit : la plateforme prend autant que le créateur (0,5 %) ; standard : elle prend plus que le niveau réduit
    expect(SOL_PLATFORM_RATE.low).toBe(0.005);
    expect(SOL_PLATFORM_RATE.standard).toBeGreaterThan(SOL_PLATFORM_RATE.low);
  });
});
