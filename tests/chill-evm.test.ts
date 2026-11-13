import { describe, it, expect } from "vitest";
import { signRef, verifyRef } from "@/lib/swap/chill-evm";

const p = { postId: "11111111-1111-1111-1111-111111111111", chain: "base", taker: "0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa", to: "0x0000000000001ff3684f28c67538d4d072c22734", data: "0xabcdef", feeNative: "3000000000000000", holder: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };

describe("chill evm ref token", () => {
  it("accepts the exact quote", () => { expect(verifyRef(p, signRef(p))).toBe(true); });
  it("rejects changed holder, fee, data or post", () => {
    const t = signRef(p);
    expect(verifyRef({ ...p, holder: "0xcccccccccccccccccccccccccccccccccccccccc" }, t)).toBe(false);
    expect(verifyRef({ ...p, feeNative: "9000000000000000" }, t)).toBe(false);
    expect(verifyRef({ ...p, data: "0xabcdee" }, t)).toBe(false);
    expect(verifyRef({ ...p, postId: "22222222-2222-2222-2222-222222222222" }, t)).toBe(false);
  });
  it("is case-insensitive on addresses and data", () => {
    expect(verifyRef({ ...p, taker: p.taker.toLowerCase(), data: "0xABCDEF" }, signRef(p))).toBe(true);
  });
});
