import { describe, expect, it } from "vitest";
import { tokenHref, trendScore, validTokenAddress } from "@/lib/token-boost";

describe("token boost", () => {
  it("vérifie l'adresse selon le réseau", () => {
    expect(validTokenAddress("solana", "7KpHQZJFNtEH6z5rM3o7TMNJ7ezSpABgZyXG4dDPGBom")).toBe(true);
    expect(validTokenAddress("solana", "0x1234567890abcdef1234567890abcdef12345678")).toBe(false);
    expect(validTokenAddress("base", "0x1234567890abcdef1234567890abcdef12345678")).toBe(true);
    expect(validTokenAddress("base", "7KpHQZJFNtEH6z5rM3o7TMNJ7ezSpABgZyXG4dDPGBom")).toBe(false);
  });
  it("ouvre la page OM ou le Terminal", () => {
    expect(tokenHref({ chain: "solana", mint: "abc", om: true })).toBe("/launchpad/abc");
    expect(tokenHref({ chain: "solana", mint: "abc" })).toBe("/terminal?mint=abc");
    expect(tokenHref({ chain: "base", mint: "0xabc" })).toBe("/terminal?chain=base&mint=0xabc");
  });
  it("l'engagement compte autant que le volume", () => {
    expect(trendScore(1_000_000, 0)).toBeGreaterThan(trendScore(1_000, 0));
    expect(trendScore(1_000, 30)).toBeGreaterThan(trendScore(1_000, 0));
  });
});
