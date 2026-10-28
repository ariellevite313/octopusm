import { describe, it, expect } from "vitest";
import { swapDelta } from "@/lib/hackathon/swap-delta";

const MINT = "MintAaaa", ME = "Wallet1";
const tb = (mint: string, owner: string, v: string) => ({ mint, owner, uiTokenAmount: { uiAmountString: v, amount: "0" } });

describe("swapDelta", () => {
  it("detects a buy: SOL out (network fee excluded), tokens in", () => {
    const r = swapDelta({ wallet: ME, mint: MINT, feeLamports: 5000, preLamports: 2_000_000_000, postLamports: 1_000_000_000 - 5000,
      preTokens: [], postTokens: [tb(MINT, ME, "1500")] });
    expect(r).toEqual({ side: "buy", tokenAmount: 1500, solAmount: 1 });
  });
  it("detects a sell: tokens out, SOL in", () => {
    const r = swapDelta({ wallet: ME, mint: MINT, feeLamports: 5000, preLamports: 1_000_000_000, postLamports: 1_500_000_000 - 5000,
      preTokens: [tb(MINT, ME, "300")], postTokens: [tb(MINT, ME, "100")] });
    expect(r).toEqual({ side: "sell", tokenAmount: 200, solAmount: 0.5 });
  });
  it("counts wrapped SOL moved by the wallet", () => {
    const WSOL = "So11111111111111111111111111111111111111112";
    const r = swapDelta({ wallet: ME, mint: MINT, feeLamports: 0, preLamports: 1_000_000_000, postLamports: 1_000_000_000,
      preTokens: [tb(WSOL, ME, "2")], postTokens: [tb(WSOL, ME, "1.5"), tb(MINT, ME, "10")] });
    expect(r?.side).toBe("buy"); expect(r?.solAmount).toBeCloseTo(0.5);
  });
  it("ignores other wallets' balances and plain transfers", () => {
    expect(swapDelta({ wallet: ME, mint: MINT, feeLamports: 0, preLamports: 1, postLamports: 1, preTokens: [], postTokens: [tb(MINT, "other", "9")] })).toBeNull();
    // tokens received with no SOL spent = transfer, not a purchase
    expect(swapDelta({ wallet: ME, mint: MINT, feeLamports: 5000, preLamports: 1_000_000_000, postLamports: 1_000_000_000 - 5000, preTokens: [], postTokens: [tb(MINT, ME, "50")] })).toBeNull();
  });
});
