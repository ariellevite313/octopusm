import { describe, it, expect } from "vitest";
import { MAJOR_FEE_BPS, isMajorSolana, isMajorEvm } from "@/lib/swap/majors";
import { evmFeeBps, EVM_FEE_BPS } from "@/lib/swap/evm";
import { SOL_MINT, USDC_MINT } from "@/lib/swap/core";

describe("major token fee", () => {
  it("is 0.03%", () => expect(MAJOR_FEE_BPS).toBe(3));
  it("recognises solana majors", () => {
    expect(isMajorSolana(SOL_MINT)).toBe(true);
    expect(isMajorSolana(USDC_MINT)).toBe(true);
    expect(isMajorSolana("SomeRandomMint1111111111111111111111111111")).toBe(false);
  });
  it("recognises evm majors case-insensitively and per chain", () => {
    expect(isMajorEvm("hyperliquid", "0x5555555555555555555555555555555555555555")).toBe(true);
    expect(isMajorEvm("base", "0xCBB7C0000aB88B473b1f5aFd9ef808440eed33Bf")).toBe(true);
    expect(isMajorEvm("base", "0x5555555555555555555555555555555555555555")).toBe(false);
  });
  it("falls back to 0.3% for others", () => {
    expect(evmFeeBps("base", "0x1111111111111111111111111111111111111111")).toBe(EVM_FEE_BPS);
    expect(evmFeeBps("bnb", "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c")).toBe(3);
  });
});
