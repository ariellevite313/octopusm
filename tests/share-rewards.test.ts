import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock("@/lib/octo", () => ({ awardOcto: vi.fn() }));
const { distributePoolShare, POOL_SHARE_OF_COMMISSION } = await import("../lib/social/share-rewards");

function fakeSb(attrs: { bettor: string; sharer: string }[]) {
  const inserted: Record<string, unknown[]> = {};
  const sb = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ eq: async () => ({ data: attrs }) }) }),
      insert: async (rows: unknown[]) => { inserted[table] = rows; return { error: null }; },
    }),
  };
  return { sb, inserted };
}

describe("pool share rewards", () => {
  it("splits 20% of the platform commission by stake coming from each post, whatever the option", async () => {
    const { sb, inserted } = fakeSb([{ bettor: "A", sharer: "S1" }, { bettor: "B", sharer: "S1" }, { bettor: "C", sharer: "S2" }]);
    // A et B (via S1) : 30 + 10 ; C (via S2) : 40 ; D sans post : 100
    await distributePoolShare(sb, "00000000-0000-4000-8000-000000000001", [
      { wallet_address: "A", amount: 30 }, { wallet_address: "B", amount: 10 }, { wallet_address: "C", amount: 40 }, { wallet_address: "D", amount: 100 },
    ], 10, false);
    const rows = inserted.referral_commissions as { referrer_wallet: string; amount_usdc: number }[];
    const pot = 10 * POOL_SHARE_OF_COMMISSION; // 2 USDC
    expect(rows.find((r) => r.referrer_wallet === "S1")?.amount_usdc).toBeCloseTo(pot * 40 / 80);
    expect(rows.find((r) => r.referrer_wallet === "S2")?.amount_usdc).toBeCloseTo(pot * 40 / 80);
    expect(rows.reduce((s, r) => s + r.amount_usdc, 0)).toBeCloseTo(pot);
  });

  it("pays nothing when the platform took no commission (refund case)", async () => {
    const { sb, inserted } = fakeSb([{ bettor: "A", sharer: "S1" }]);
    await distributePoolShare(sb, "00000000-0000-4000-8000-000000000001", [{ wallet_address: "A", amount: 30 }], 0, false);
    expect(inserted.referral_commissions).toBeUndefined();
  });
});
