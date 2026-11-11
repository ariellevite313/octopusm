/** Moteur de swap : contrôle des paramètres, mint des frais, lecture des montants d'un swap confirmé. */
import { describe, it, expect } from "vitest";
import { checkSwapInput, feeMintFor, tradedMint, SOL_MINT, USDC_MINT } from "@/lib/swap/core";
import { swapAmounts } from "@/lib/swap/record";

const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const W = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const FEE = "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ";

describe("checkSwapInput", () => {
  it("accepts a SOL pair", () => {
    expect(checkSwapInput({ inputMint: SOL_MINT, outputMint: BONK, amount: "1000000", slippageBps: 100 })).toEqual({ ok: true, v: { inputMint: SOL_MINT, outputMint: BONK, amount: "1000000", slippageBps: 100 } });
  });
  it.each([
    [{ inputMint: BONK, outputMint: BONK, amount: "1" }, /different/],
    [{ inputMint: BONK, outputMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB264", amount: "1" }, /SOL or USDC|Invalid token/],
    [{ inputMint: SOL_MINT, outputMint: BONK, amount: "0" }, /amount/],
    [{ inputMint: SOL_MINT, outputMint: BONK, amount: "1.5" }, /amount/],
    [{ inputMint: SOL_MINT, outputMint: BONK, amount: "-3" }, /amount/],
    [{ inputMint: SOL_MINT, outputMint: BONK, amount: "5", slippageBps: 5000 }, /Slippage/],
    [{ inputMint: "javascript:x", outputMint: BONK, amount: "5" }, /Invalid token/],
  ])("rejects %j", (b, re) => {
    const r = checkSwapInput(b);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(re);
  });
});

describe("fee mint", () => {
  it("prefers SOL, then USDC", () => {
    expect(feeMintFor(BONK, SOL_MINT)).toBe(SOL_MINT);
    expect(feeMintFor(USDC_MINT, SOL_MINT)).toBe(SOL_MINT);
    expect(feeMintFor(USDC_MINT, BONK)).toBe(USDC_MINT);
    expect(feeMintFor(BONK, "x")).toBeNull();
    expect(tradedMint(SOL_MINT, BONK)).toBe(BONK);
    expect(tradedMint(BONK, USDC_MINT)).toBe(BONK);
  });
});

describe("swapAmounts", () => {
  const tb = (owner: string, mint: string, amount: string, i = 1) => ({ accountIndex: i, owner, mint, uiTokenAmount: { amount } });
  it("buy with SOL: reads SOL spent, tokens received, fee to the platform", () => {
    const r = swapAmounts({
      wallet: W, feeWallet: FEE, feeLamports: 5000, preLamports: 2_000_000_000, postLamports: 999_995_000,
      preTokens: [tb(FEE, SOL_MINT, "100", 3)], postTokens: [tb(W, BONK, "5000000"), tb(FEE, SOL_MINT, "3000100", 3)],
    }, SOL_MINT, BONK, SOL_MINT);
    expect(r).toEqual({ inAmount: 1_000_000_000n, outAmount: 5_000_000n, feeAmount: 3_000_000n });
  });
  it("rejects a transaction that is not this swap", () => {
    expect(swapAmounts({ wallet: W, feeWallet: FEE, feeLamports: 5000, preLamports: 10, postLamports: 5, preTokens: [], postTokens: [] }, SOL_MINT, BONK, SOL_MINT)).toBeNull();
  });
});

import { mapPools } from "@/lib/terminal";
describe("terminal mapPools", () => {
  it("maps GeckoTerminal pools, skips SOL/USDC bases, duplicates and unsafe images", () => {
    const r = mapPools({
      data: [
        { attributes: { address: "pool1", base_token_price_usd: "0.0001", market_cap_usd: null, fdv_usd: "1000000", reserve_in_usd: "50000", price_change_percentage: { h24: "-3.5" }, volume_usd: { h24: "200000" } }, relationships: { base_token: { data: { id: "solana_B1" } } } },
        { attributes: { address: "pool2" }, relationships: { base_token: { data: { id: "solana_SOL" } } } },
        { attributes: { address: "pool3" }, relationships: { base_token: { data: { id: "solana_B1" } } } },
      ],
      included: [
        { id: "solana_B1", attributes: { address: "BonkMint", name: "Bonk", symbol: "BONK", image_url: "missing.png" } },
        { id: "solana_SOL", attributes: { address: SOL_MINT, name: "Wrapped SOL", symbol: "SOL", image_url: "https://x/sol.png" } },
      ],
    });
    expect(r).toEqual([{ mint: "BonkMint", symbol: "BONK", name: "Bonk", logo: null, price: 0.0001, change24h: -3.5, volume24h: 200000, mcap: 1000000, liquidity: 50000, pool: "pool1", createdAt: null, chain: "solana" }]);
  });
});

describe("terminal mapPools on EVM chains", () => {
  it("tags the chain and skips wrapped ETH / stables", () => {
    const r = mapPools({
      data: [
        { attributes: { address: "p1" }, relationships: { base_token: { data: { id: "base_X" } } } },
        { attributes: { address: "p2" }, relationships: { base_token: { data: { id: "base_W" } } } },
      ],
      included: [
        { id: "base_X", attributes: { address: "0xabc", name: "Degen", symbol: "DEGEN" } },
        { id: "base_W", attributes: { address: "0x4200000000000000000000000000000000000006", name: "Wrapped Ether", symbol: "WETH" } },
      ],
    }, "base");
    expect(r.map((t) => [t.symbol, t.chain])).toEqual([["DEGEN", "base"]]);
  });
});

import { rankEarners } from "@/lib/top-earners";
describe("top traders (earnings on OM)", () => {
  it("adds chill, creator fees and prediction gains per wallet, ignores losses", () => {
    const r = rankEarners([
      { wallet: "a", usd: 10, kind: "chill" }, { wallet: "a", usd: 5, kind: "creator" },
      { wallet: "b", usd: 30, kind: "predict" }, { wallet: "b", usd: -20, kind: "predict" }, { wallet: "c", usd: NaN, kind: "chill" },
    ]);
    expect(r.map((e) => [e.wallet, e.usd])).toEqual([["b", 30], ["a", 15]]);
    expect(r[1].parts).toEqual({ chill: 10, creator: 5, predict: 0 });
  });
});

import { mergeLists } from "@/lib/terminal";
describe("terminal mergeLists", () => {
  const t = (mint: string, v: number, c: string) => ({ mint, symbol: mint, name: mint, logo: null, price: 1, change24h: 0, volume24h: v, mcap: 1, liquidity: 1, pool: "p", createdAt: c });
  it("interleaves trending, sorts volume and new", () => {
    const a = [t("a1", 5, "2026-01-01"), t("a2", 1, "2026-01-03")], b = [t("b1", 9, "2026-01-02")];
    expect(mergeLists([a, b], "trending").map((x) => x.mint)).toEqual(["a1", "b1", "a2"]);
    expect(mergeLists([a, b], "volume").map((x) => x.mint)).toEqual(["b1", "a1", "a2"]);
    expect(mergeLists([a, b], "new").map((x) => x.mint)).toEqual(["a2", "b1", "a1"]);
  });
});
