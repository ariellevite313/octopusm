import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/market/create-pool", () => ({ createPoolMarket: vi.fn() }));
vi.mock("@/lib/market/pool-resolve", () => ({ resolvePool: vi.fn() }));
const { nextTarget, money } = await import("@/lib/market/token-pools");

describe("token pools", () => {
  it("picks a round target about twice the market cap", () => {
    expect(nextTarget(30_000)).toBe(100_000);
    expect(nextTarget(45_000)).toBe(100_000);
    expect(nextTarget(80_000)).toBe(200_000);
    expect(nextTarget(1_200_000)).toBe(5_000_000);
    expect(nextTarget(400_000)).toBe(1_000_000);
  });
  it("always targets above the current market cap", () => {
    for (const m of [10_000, 12_345, 99_999, 250_000, 3_000_000]) expect(nextTarget(m)).toBeGreaterThan(m);
  });
  it("formats money compactly", () => {
    expect(money(1_000_000)).toBe("$1M");
    expect(money(250_000)).toBe("$250K");
  });
});
