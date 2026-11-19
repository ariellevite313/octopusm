import { afterEach, describe, expect, it, vi } from "vitest";
import { createSolLimitOrder, isSolUsdc } from "@/lib/swap/jup-trigger";

const SOL = "So11111111111111111111111111111111111111112", USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function mockFetch(sent: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("dexscreener")) return new Response(JSON.stringify([{ baseToken: { address: SOL }, priceUsd: "72.4", marketCap: 4e10, liquidity: { usd: 1e7 } }]));
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ order: "ord", transaction: "AAAA", requestId: "r" }));
  }));
}
afterEach(() => vi.unstubAllGlobals());

describe("SOL limit orders (USDC)", () => {
  it("buy: spends USDC, gets SOL at the target price", async () => {
    const sent: { inputMint: string; outputMint: string; params: { makingAmount: string; takingAmount: string } }[] = [];
    mockFetch(sent);
    const r = await createSolLimitOrder("maker", { side: "buy", amount: 100, targetPrice: 50 });
    expect(sent[0].inputMint).toBe(USDC); expect(sent[0].outputMint).toBe(SOL);
    expect(sent[0].params.makingAmount).toBe("100000000");
    expect(sent[0].params.takingAmount).toBe("2000000000");
    expect(r.amountSol).toBe(2);
  });
  it("sell: sells SOL for USDC above the price", async () => {
    const sent: { inputMint: string; params: { makingAmount: string; takingAmount: string } }[] = [];
    mockFetch(sent);
    await createSolLimitOrder("maker", { side: "sell", amount: 1.5, targetPrice: 100 });
    expect(sent[0].inputMint).toBe(SOL);
    expect(sent[0].params.makingAmount).toBe("1500000000");
    expect(sent[0].params.takingAmount).toBe("150000000");
  });
  it("refuses a target on the wrong side", async () => {
    mockFetch([]);
    await expect(createSolLimitOrder("maker", { side: "buy", amount: 10, targetPrice: 80 })).rejects.toThrow(/below the current price/);
  });
  it("detects SOL/USDC orders only", () => {
    expect(isSolUsdc({ inputMint: USDC, outputMint: SOL })).toBe(true);
    expect(isSolUsdc({ inputMint: SOL, outputMint: "Tok" })).toBe(false);
  });
});
