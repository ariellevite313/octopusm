import { describe, expect, it, vi, beforeEach } from "vitest";
const award = vi.fn(async () => {});
vi.mock("@/lib/octo", () => ({ awardOcto: award }));
vi.mock("@/lib/moderation", () => ({ isBanned: vi.fn(async () => false) }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
const { awardSwapOmero } = await import("@/lib/trade-rewards");

function db(today: number) {
  const q = { select: () => q, eq: () => q, like: () => q, gte: async () => ({ data: today ? [{ amount: today }] : [] }) };
  return { from: () => q };
}
const W = "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ";

describe("OMERO for Terminal swaps", () => {
  beforeEach(() => award.mockClear());
  it("gives 1 OMERO per dollar on full-fee swaps", async () => {
    expect(await awardSwapOmero(db(0), { txId: "a", trader: W, volumeUsd: 250.7, feeUsd: 0.75 })).toBe(250);
    expect(award).toHaveBeenCalledWith(W, 250, "swap", "terminal:a");
  });
  it("gives nothing on low-fee (major) swaps", async () => {
    expect(await awardSwapOmero(db(0), { txId: "b", trader: W, volumeUsd: 1000, feeUsd: 0.3 })).toBe(0);
    expect(award).not.toHaveBeenCalled();
  });
  it("caps per swap and per day", async () => {
    expect(await awardSwapOmero(db(0), { txId: "c", trader: W, volumeUsd: 50_000, feeUsd: 150 })).toBe(10_000);
    expect(await awardSwapOmero(db(19_500), { txId: "d", trader: W, volumeUsd: 5_000, feeUsd: 15 })).toBe(500);
    expect(await awardSwapOmero(db(20_000), { txId: "e", trader: W, volumeUsd: 5_000, feeUsd: 15 })).toBe(0);
  });
});
