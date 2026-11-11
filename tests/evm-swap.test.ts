/** Swaps EVM (0x) : contrôle des paramètres, frais OM en natif, refus d'un contrat inconnu. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { checkEvmInput, zeroXParams, zeroX, NATIVE, EVM_FEE_BPS } from "@/lib/swap/evm";

const TOKEN = "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed";
const W = "0x1111111111111111111111111111111111111111";

describe("checkEvmInput", () => {
  it("accepts a buy on Base and rejects bad input", () => {
    expect(checkEvmInput({ chain: "base", side: "buy", token: TOKEN, amount: "1000", slippageBps: 100 }, W).ok).toBe(true);
    for (const b of [{ chain: "eth", side: "buy", token: TOKEN, amount: "1" }, { chain: "base", side: "x", token: TOKEN, amount: "1" }, { chain: "base", side: "buy", token: NATIVE, amount: "1" }, { chain: "bnb", side: "sell", token: TOKEN, amount: "0" }, { chain: "bnb", side: "sell", token: "abc", amount: "1" }]) {
      expect(checkEvmInput(b, W).ok).toBe(false);
    }
  });
  it("builds 0x params with the OM fee in the native token", () => {
    const c = checkEvmInput({ chain: "bnb", side: "sell", token: TOKEN, amount: "5", slippageBps: 300 }, W);
    if (!c.ok) throw new Error();
    const p = zeroXParams(c.v);
    expect(p.get("chainId")).toBe("56");
    expect(p.get("sellToken")).toBe(TOKEN);
    expect(p.get("buyToken")).toBe(NATIVE);
    expect(p.get("swapFeeBps")).toBe(String(EVM_FEE_BPS));
    expect(p.get("swapFeeToken")).toBe(NATIVE);
    expect(p.get("taker")).toBe(W);
  });
});

describe("zeroX", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.ZEROX_API_KEY; });
  const v = { chain: "base" as const, side: "buy" as const, token: TOKEN, amount: "1000", slippageBps: 100, taker: W };
  it("returns the transaction only when sent to the 0x AllowanceHolder", async () => {
    process.env.ZEROX_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ liquidityAvailable: true, buyAmount: "50", minBuyAmount: "49", transaction: { to: "0x0000000000001fF3684f28c67538d4D072C22734", data: "0x", value: "1000" } }))));
    expect((await zeroX(v, "quote")).tx?.to).toBe("0x0000000000001fF3684f28c67538d4D072C22734");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ liquidityAvailable: true, buyAmount: "50", transaction: { to: "0xdead000000000000000000000000000000000000", data: "0x", value: "1000" } }))));
    await expect(zeroX(v, "quote")).rejects.toThrow(/Unexpected/);
  });
  it("needs the API key", async () => {
    await expect(zeroX(v, "price")).rejects.toThrow(/not configured/);
  });
});
