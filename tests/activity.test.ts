import { describe, expect, it } from "vitest";
import { ACTIVITY_MAX, getActivity } from "@/lib/activity";

// Base factice : chaque table renvoie ses lignes, les filtres sont ignorés sauf la limite
function fakeDb(tables: Record<string, unknown[]>) {
  return {
    from(t: string) {
      const rows = tables[t] ?? [];
      const q: Record<string, unknown> = {};
      for (const k of ["select", "eq", "in", "ilike", "gte", "lt", "order"]) q[k] = () => q;
      q.limit = (n: number) => Promise.resolve({ data: rows.slice(0, n) });
      q.then = (res: (v: { data: unknown[] }) => unknown) => res({ data: rows });
      return q;
    },
  };
}

describe("getActivity", () => {
  it("merges my actions and Janus actions, newest first, at most 90", async () => {
    const db = fakeDb({
      om_limit_orders: [{ order_key: "o1", mint: "M", side: "buy", amount_sol: 0.5, target_mcap: 1.36e6, status: "open", created_at: "2026-11-19T10:00:00Z" }],
      swaps: Array.from({ length: 120 }, (_, i) => ({ signature: `s${i}`, traded_mint: "M", side: "sell", volume_usd: 10, created_at: `2026-11-18T${String(i % 24).padStart(2, "0")}:00:00Z` })),
      agent_wallets: [{ id: "w1" }],
      agent_wallet_actions: [{ kind: "swap", amount_usd: 0, status: "failed", summary: "Janus stop loss: sell 5 tokens of ANTBTZQ1EUuTxUs3tfeampxdqTWPHmwyJmcWj4xoAyNe", tx: null, error: "paused", created_at: "2026-11-19T12:00:00Z" }],
      agent_exit_rules: [],
    });
    const l = await getActivity(db, "me", {});
    expect(l.length).toBe(ACTIVITY_MAX);
    expect(l[0]).toMatchObject({ who: "janus", status: "failed", error: "paused", side: "sell" });
    expect(l[0].label).toContain("ANTB…AyNe");
    expect(l[1]).toMatchObject({ who: "you", kind: "limit", status: "open" });
    expect((await getActivity(db, "me", { who: "you" })).every((a) => a.who === "you")).toBe(true);
  });
});
