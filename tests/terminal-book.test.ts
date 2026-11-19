import { describe, expect, it } from "vitest";
import { depth, merge } from "@/lib/terminal-book";

describe("carnet d'ordres", () => {
  it("profondeur à produit constant", () => {
    const d = depth(1_000_000, 200_000, 100); // R = 1000 SOL
    expect(d.asks[3].mcap).toBeCloseTo(1_050_000);
    expect(d.asks[3].sol).toBeCloseTo(1000 * (Math.sqrt(1.05) - 1));
    expect(d.bids[3].sol).toBeCloseTo(1000 * (1 - Math.sqrt(0.95)));
  });
  it("mélange les ordres OM du bon côté", () => {
    const d = depth(1_000_000, 200_000, 100);
    const m = merge(1_000_000, d, [
      { order_key: "a", maker: "x", side: "buy", amount_sol: 3, target_mcap: 990_000, status: "open", checked_at: null, created_at: "" },
      { order_key: "b", maker: "x", side: "sell", amount_sol: 2, target_mcap: 1_003_000, status: "open", checked_at: null, created_at: "" },
    ]);
    expect(m.bids.find((r) => r.om)?.mcap).toBe(990_000);
    expect(m.asks.find((r) => r.om)?.mcap).toBe(1_003_000);
    expect(m.asks[0].mcap).toBeGreaterThan(m.asks[m.asks.length - 1].mcap);
    expect(m.bids[0].mcap).toBeGreaterThan(m.bids[m.bids.length - 1].mcap);
  });
});
