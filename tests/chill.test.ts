/** « Chill ton sac » : partage des frais, part du détenteur, virement, lecture de ce qu'il a reçu. */
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { CHILL_SHARE_BPS, cutOf, feeSplit, refTransferIx } from "@/lib/swap/chill";
import { holderReceived } from "@/lib/swap/record";
import { SOL_MINT, USDC_MINT, ataOf } from "@/lib/swap/core";

const U = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const H = new PublicKey("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");

describe("fee split", () => {
  it("40% of 30 bps goes to the holder, OM keeps 18 bps", () => {
    expect(feeSplit(30, true)).toEqual({ jupBps: 18, refBps: CHILL_SHARE_BPS });
    expect(feeSplit(30, false)).toEqual({ jupBps: 30, refBps: 0 });
    expect(feeSplit(0, true)).toEqual({ jupBps: 0, refBps: 0 }); // tokens OM : pas de frais, pas de part
    expect(cutOf(1_000_000_000n, 12)).toBe(1_200_000n);
  });
});

describe("refTransferIx", () => {
  it("SOL: system transfer from the user to the holder", () => {
    const ix = refTransferIx(U, H, SOL_MINT, 1_200_000n);
    expect(ix.programId.toBase58()).toBe("11111111111111111111111111111111");
    expect(ix.keys[0].pubkey.equals(U)).toBe(true);
    expect(ix.keys[1].pubkey.equals(H)).toBe(true);
  });
  it("USDC: SPL transfer between the two USDC accounts, signed by the user", () => {
    const ix = refTransferIx(U, H, USDC_MINT, 3600n);
    const m = new PublicKey(USDC_MINT);
    expect(ix.keys[0].pubkey.equals(ataOf(U, m))).toBe(true);
    expect(ix.keys[1].pubkey.equals(ataOf(H, m))).toBe(true);
    expect(ix.keys[2]).toMatchObject({ isSigner: true });
    expect(ix.data[0]).toBe(3);
    expect(ix.data.readBigUInt64LE(1)).toBe(3600n);
  });
  it("refuses other mints", () => {
    expect(() => refTransferIx(U, H, "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", 1n)).toThrow();
  });
});

describe("holderReceived", () => {
  const tb = (owner: string, mint: string, amount: string) => ({ accountIndex: 1, owner, mint, uiTokenAmount: { amount } });
  it("reads lamports for SOL and token deltas for USDC, never negative", () => {
    expect(holderReceived({ holder: H.toBase58(), mint: SOL_MINT, keys: [U.toBase58(), H.toBase58()], preBalances: [5e9, 1e9], postBalances: [4e9, 1e9 + 1_200_000], preTokens: [], postTokens: [] })).toBe(1_200_000n);
    expect(holderReceived({ holder: H.toBase58(), mint: USDC_MINT, keys: [], preBalances: [], postBalances: [], preTokens: [tb(H.toBase58(), USDC_MINT, "100")], postTokens: [tb(H.toBase58(), USDC_MINT, "3700")] })).toBe(3600n);
    expect(holderReceived({ holder: H.toBase58(), mint: SOL_MINT, keys: [U.toBase58()], preBalances: [1], postBalances: [1], preTokens: [], postTokens: [] })).toBe(0n);
  });
});
