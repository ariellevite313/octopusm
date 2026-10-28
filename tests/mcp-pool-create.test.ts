import { describe, it, expect } from "vitest";
import { ACTIONS } from "@/lib/mcp/agent-actions";
import { extractMarketRef } from "@/lib/social/rich";

describe("agent market creation actions", () => {
  it("exposes the fee, create and draft actions", () => {
    for (const k of ["pool_fee_prepare", "pool_fee_submit", "create_pool_market", "request_pool_market"]) expect(ACTIONS[k]).toBeTruthy();
  });
  it("rejects Arc wallets and bad params before touching the network", async () => {
    await expect(ACTIONS.pool_fee_prepare.run("0x" + "a".repeat(40), { title: "Will it rain tomorrow?" }, { origin: "http://x", ip: "1" })).rejects.toThrow(/Solana/);
    await expect(ACTIONS.create_pool_market.run("11111111111111111111111111111112", { title: "x" }, { origin: "http://x", ip: "1" })).rejects.toThrow(/creation_tx/);
  });
});

describe("market link detection", () => {
  it("finds pool and prediction links, with or without domain", () => {
    expect(extractMarketRef("look https://omdot.fun/pools/will-it-rain-ab12cd34 now")).toEqual({ kind: "pool", key: "will-it-rain-ab12cd34" });
    expect(extractMarketRef("/prediction/btc-100k")).toEqual({ kind: "prediction", key: "btc-100k" });
    expect(extractMarketRef("https://omdot.fun/pools/x?via=1")?.key).toBe("x");
  });
});

describe("program (mandate) actions", () => {
  it("are exposed and validate input before any database access", async () => {
    for (const k of ["set_program", "get_program", "end_program"]) expect(ACTIONS[k]).toBeTruthy();
    await expect(ACTIONS.set_program.run("11111111111111111111111111111112", { brief: "short" }, { origin: "http://x", ip: "1" })).rejects.toThrow(/brief/);
    await expect(ACTIONS.set_program.run("11111111111111111111111111111112", { brief: "x".repeat(30), days: 90 }, { origin: "http://x", ip: "1" })).rejects.toThrow(/days/);
  });
});
