import { describe, it, expect } from "vitest";
import { computeTradeRewards, PLATFORM_FEE_RATE, REFERRER_SHARE_OF_FEE, POST_SHARE_OF_FEE } from "@/lib/trade-rewards";

describe("computeTradeRewards", () => {
  it("paie un pourcentage des frais de la plateforme", () => {
    const r = computeTradeRewards("arc", 1000, { hasReferrer: true, hasPost: true });
    expect(r.fee).toBeCloseTo(2.5);
    expect(r.referral).toBeCloseTo(0.25);
    expect(r.post).toBeCloseTo(0.025);
  });
  it("utilise le taux réel du token quand il est fourni, et ignore une valeur absurde", () => {
    expect(computeTradeRewards("arc", 1000, { hasReferrer: true, hasPost: false }, 0.005).fee).toBeCloseTo(5);
    expect(computeTradeRewards("arc", 1000, { hasReferrer: true, hasPost: false }, 0.5).fee).toBeCloseTo(2.5);
    expect(computeTradeRewards("arc", 1000, { hasReferrer: true, hasPost: false }, NaN).fee).toBeCloseTo(2.5);
  });
  it("ne paie rien sans parrain ni post, ni sous le minimum", () => {
    expect(computeTradeRewards("solana", 1000, { hasReferrer: false, hasPost: false })).toMatchObject({ referral: 0, post: 0 });
    expect(computeTradeRewards("arc", 0.5, { hasReferrer: true, hasPost: true })).toEqual({ fee: 0, referral: 0, post: 0 });
    expect(computeTradeRewards("arc", NaN, { hasReferrer: true, hasPost: true }).referral).toBe(0);
  });
  it("les gains ne dépassent jamais les frais de la plateforme", () => {
    for (const chain of ["arc", "solana"] as const) {
      const r = computeTradeRewards(chain, 12345, { hasReferrer: true, hasPost: true });
      expect(r.referral + r.post).toBeLessThan(r.fee);
    }
    expect(REFERRER_SHARE_OF_FEE + POST_SHARE_OF_FEE).toBeLessThan(1);
    expect(PLATFORM_FEE_RATE.arc).toBeLessThanOrEqual(0.0025);
  });
});
