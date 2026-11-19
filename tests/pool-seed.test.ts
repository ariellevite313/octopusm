import { describe, expect, it, vi } from "vitest";
import { pickSeedOption, seedAmount, seedPool, HOUSE_WALLET } from "@/lib/market/pool-seed";
import { POOL_CREATION_FEE_USDC, POOL_SEED_USDC, POOL_SEED_CLT, POOL_CREATION_FEE_CLT } from "@/lib/market/pool-fee";

describe("pool seed", () => {
  it("fee is 1 USDC and half seeds the pool", () => {
    expect(POOL_CREATION_FEE_USDC).toBe(1);
    expect(POOL_SEED_USDC).toBe(POOL_CREATION_FEE_USDC / 2);
    expect(POOL_SEED_CLT).toBe(POOL_CREATION_FEE_CLT / 2);
    expect(seedAmount("usdc")).toBe(0.5);
    expect(seedAmount("clawdtrust")).toBe(250_000);
  });
  it("picks every option over many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(pickSeedOption(["opt_0", "opt_1", "opt_2"]));
    expect([...seen].sort()).toEqual(["opt_0", "opt_1", "opt_2"]);
  });
  it("inserts an approved house bet and bumps the total", async () => {
    const inserts: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: (t: string) => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { address: HOUSE_WALLET } }) }) }),
        insert: async (row: Record<string, unknown>) => { inserts.push({ t, ...row }); return { error: null }; },
      }),
      rpc,
    };
    const opt = await seedPool(admin, { id: "m1", options: [{ id: "opt_0" }, { id: "opt_1" }], bet_token: "usdc" });
    expect(["opt_0", "opt_1"]).toContain(opt);
    expect(inserts[0]).toMatchObject({ t: "mutuel_bets", wallet_address: HOUSE_WALLET, amount: 0.5, token: "usdc", status: "approved", option_id: opt });
    expect(rpc).toHaveBeenCalledWith("increment_pool_total", { p_market_id: "m1", p_token: "usdc", p_amount: 0.5 });
  });
});
