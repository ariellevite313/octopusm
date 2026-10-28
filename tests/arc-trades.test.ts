import { describe, it, expect, vi } from "vitest";

const calls: { from: bigint; to: bigint }[] = [];
vi.mock("viem", async (orig) => {
  const real = await orig<typeof import("viem")>();
  return {
    ...real,
    createPublicClient: () => ({
      getBlockNumber: async () => 5000n,
      getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: 1_700_000_000n + blockNumber / 2n }),
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        calls.push({ from: fromBlock, to: toBlock });
        if (fromBlock === 3000n) {
          return [{ blockNumber: 4000n, logIndex: 1, transactionHash: "0xabc", args: { trader: "0xAAA", isBuy: true, usdcAmount: 10n * 10n ** 18n, tokenAmount: 1000n * 10n ** 18n } }];
        }
        return [];
      },
    }),
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));

const { syncCurveTrades } = await import("../lib/arc-trades");

function fakeDb() {
  const saved: Record<string, unknown[]> = {};
  const db = {
    from: (t: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
        ilike: () => ({ maybeSingle: async () => ({ data: t === "launchpad_tokens" ? { arc_creation_block: 1000 } : null }) }),
      }),
      upsert: async (rows: unknown) => { saved[t] = [...(saved[t] ?? []), ...(Array.isArray(rows) ? rows : [rows])]; return { error: null }; },
    }),
  };
  return { db, saved };
}

describe("Arc trades sync", () => {
  it("reads the chain in 2,000-block chunks from the creation block, stores trades with real block time, and remembers the last block", async () => {
    const { db, saved } = fakeDb();
    const done = await syncCurveTrades("0x1111111111111111111111111111111111111111", 40, db);
    expect(done).toBe(true);
    expect(calls.map((c) => [c.from, c.to])).toEqual([[1000n, 2999n], [3000n, 4999n], [5000n, 5000n]]);
    const trade = saved.arc_trades[0] as { price: number; ts: number; trader: string };
    expect(trade.price).toBeCloseTo(0.01);
    expect(trade.trader).toBe("0xaaa");
    expect(trade.ts).toBe(1_700_000_000 + 2000); // bloc 4000 → horodatage réel interpolé
    const st = saved.arc_trades_state.at(-1) as { last_block: number };
    expect(st.last_block).toBe(5000);
  });
});

import { arcPoolId } from "@/lib/arc-trades";
describe("arcPoolId", () => {
  it("donne le même identifiant que Uniswap V4 (keccak du PoolKey)", () => {
    // valeur calculée par Solidity : keccak256(abi.encode(PoolKey(0, 0xab, 5000, 60, 0)))
    expect(arcPoolId("0x00000000000000000000000000000000000000ab")).toBe("0x9eafe0b40602a9a9f65355188755701e2dfb039391d17064d08747d8927a6484");
    // frais différents = pool différent
    expect(arcPoolId("0x00000000000000000000000000000000000000ab", 25000)).not.toBe(arcPoolId("0x00000000000000000000000000000000000000ab", 20000));
  });
});
