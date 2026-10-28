import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const requireWallet = vi.fn();
vi.mock("@/lib/social/session", () => ({ requireWallet: () => requireWallet() }));

const rewards = [
  { id: "1", kind: "post",     amount_usdc: "0.42", created_at: "2026-10-28T10:00:00Z", token_id: "t1" },
  { id: "2", kind: "referral", amount_usdc: 0.18,   created_at: "2026-10-28T08:00:00Z", token_id: "t2" },
  { id: "3", kind: "post",     amount_usdc: 0.09,   created_at: "2026-10-27T08:00:00Z", token_id: "t1" },
];
let asked: { beneficiary?: string } = {};
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "trade_rewards") {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.ilike = (_c: string, v: string) => { asked.beneficiary = v; return q; };
        q.order = () => q;
        q.limit = () => Promise.resolve({ data: rewards, error: null });
        return q;
      }
      return { select: () => ({ in: () => Promise.resolve({ data: [
        { id: "t1", name: "Nova Orbit", ticker: "NOVA", logo_url: null },
        { id: "t2", name: "PixelKiln",  ticker: "PIXEL", logo_url: "x.png" },
      ] }) }) };
    },
  }),
}));

import { GET } from "@/app/api/dashboard/trade-gains/route";

describe("GET /api/dashboard/trade-gains", () => {
  beforeEach(() => { asked = {}; requireWallet.mockReset(); });

  it("returns 401 when not signed in", async () => {
    requireWallet.mockResolvedValue({ error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) });
    expect((await GET()).status).toBe(401);
  });

  it("totals gains by kind and attaches token info, for the session wallet only", async () => {
    requireWallet.mockResolvedValue({ wallet: "WALLET1" });
    const res = await GET();
    const body = await res.json();
    expect(asked.beneficiary).toBe("WALLET1");
    expect(body.fromPosts).toBeCloseTo(0.51);
    expect(body.fromReferrals).toBeCloseTo(0.18);
    expect(body.total).toBeCloseTo(0.69);
    expect(body.rows[0].token.name).toBe("Nova Orbit");
    expect(body.rows[1].token.logoUrl).toBe("x.png");
  });
});
