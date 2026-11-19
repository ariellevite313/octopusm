import { describe, expect, it } from "vitest";
import { evaluateExit } from "@/lib/agent-wallet/exits";

const base = { entry_price: 1, peak_price: 1, sl_pct: null, tp_x: null, tp_sell_pct: 50, trail_pct: null, tp_done: false };

describe("evaluateExit", () => {
  it("stop loss sells everything", () => {
    expect(evaluateExit({ ...base, sl_pct: 25 }, 0.74).action).toEqual({ kind: "stop_loss", sellPct: 100 });
    expect(evaluateExit({ ...base, sl_pct: 25 }, 0.8).action).toBeNull();
  });
  it("take profit sells the chosen share once", () => {
    expect(evaluateExit({ ...base, tp_x: 2, tp_sell_pct: 40 }, 2.1).action).toEqual({ kind: "take_profit", sellPct: 40 });
    expect(evaluateExit({ ...base, tp_x: 2, tp_done: true }, 3).action).toBeNull();
  });
  it("trailing only acts after the price went above entry, and follows the peak", () => {
    expect(evaluateExit({ ...base, trail_pct: 20 }, 0.7).action).toBeNull();
    const r = evaluateExit({ ...base, trail_pct: 20 }, 1.5);
    expect(r.peak).toBe(1.5);
    expect(evaluateExit({ ...base, peak_price: 2, trail_pct: 20 }, 1.59).action).toEqual({ kind: "trailing", sellPct: 100 });
    expect(evaluateExit({ ...base, peak_price: 2, trail_pct: 20 }, 1.7).action).toBeNull();
  });
  it("stop loss wins over the rest and a bad price does nothing", () => {
    expect(evaluateExit({ ...base, sl_pct: 10, trail_pct: 5, peak_price: 2 }, 0.8).action?.kind).toBe("stop_loss");
    expect(evaluateExit({ ...base, sl_pct: 10 }, 0).action).toBeNull();
  });
});
