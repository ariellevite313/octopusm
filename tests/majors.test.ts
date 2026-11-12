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

import { EVM_CHAINS, ALLOWANCE_HOLDERS } from "@/lib/swap/evm";
describe("evm chains", () => {
  it("covers the 7 networks with distinct ids", () => {
    expect(Object.keys(EVM_CHAINS).sort()).toEqual(["arbitrum", "avalanche", "base", "bnb", "ethereum", "hyperliquid", "polygon"]);
    expect(new Set(Object.values(EVM_CHAINS).map((c) => c.id)).size).toBe(7);
  });
  it("has majors on each new network", () => {
    expect(isMajorEvm("ethereum", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")).toBe(true);
    expect(isMajorEvm("arbitrum", "0x82af49447d8a07e3bd95bd0d56f35241523fbab1")).toBe(true);
    expect(isMajorEvm("polygon", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270")).toBe(true);
    expect(isMajorEvm("avalanche", "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7")).toBe(true);
  });
  it("allowance holder addresses are valid 20-byte addresses", () => {
    for (const a of ALLOWANCE_HOLDERS) expect(a).toMatch(/^0x[0-9a-f]{40}$/);
  });
});
