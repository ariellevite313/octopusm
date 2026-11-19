import { describe, expect, it } from "vitest";
import { sharedTokenOf } from "@/lib/social/shared-token";

describe("sharedTokenOf", () => {
  it("reads the exact token from a share or Terminal link", () => {
    expect(sharedTokenOf("$ANT on OMdotfun https://omdot.fun/share/token/ANTBTZQ1EUuTxUs3tfeampxdqTWPHmwyJmcWj4xoAyNe")).toEqual({ mint: "ANTBTZQ1EUuTxUs3tfeampxdqTWPHmwyJmcWj4xoAyNe", chain: "solana" });
    expect(sharedTokenOf("look https://omdot.fun/terminal?chain=base&mint=0x1111111111111111111111111111111111111111")).toEqual({ mint: "0x1111111111111111111111111111111111111111", chain: "base" });
    expect(sharedTokenOf("omdot.fun/share/token/ANTBTZQ1EUuTxUs3tfeampxdqTWPHmwyJmcWj4xoAyNe?chain=solana")?.chain).toBe("solana");
    expect(sharedTokenOf("just $ANT")).toBeNull();
  });
});
