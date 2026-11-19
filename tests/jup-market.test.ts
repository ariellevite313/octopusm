import { afterEach, describe, expect, it, vi } from "vitest";
import { bestPair } from "@/lib/swap/jup-trigger";

afterEach(() => vi.unstubAllGlobals());

describe("bestPair falls back to Jupiter", () => {
  it("uses Jupiter when DexScreener has no pair", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("dexscreener")
      ? new Response("[]")
      : new Response(JSON.stringify([{ id: "Mint1", usdPrice: 2, mcap: 2_000_000, liquidity: 50_000 }]))));
    expect(await bestPair("Mint1")).toEqual({ price: 2, mcap: 2_000_000 });
  });
  it("uses Jupiter when DexScreener has no market cap", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("dexscreener")
      ? new Response(JSON.stringify([{ baseToken: { address: "Mint2" }, priceUsd: "1", marketCap: 0, fdv: 0 }]))
      : new Response(JSON.stringify([{ id: "Mint2", usdPrice: 1.1, mcap: 900_000 }]))));
    expect(await bestPair("Mint2")).toEqual({ price: 1.1, mcap: 900_000 });
  });
});
