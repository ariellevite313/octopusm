import { describe, it, expect } from "vitest";
import { extractMarketRef, extractMentions, extractTags } from "@/lib/social/rich";

describe("feed text parsing", () => {
  it("hashtags: lowercased, unique, letters and digits, not inside words or URLs anchors", () => {
    expect(extractTags("Go #Solana #solana #Arc2026 and #é_t")).toEqual(["solana", "arc2026", "é_t"]);
    expect(extractTags("price&#39;s and a#b")).toEqual([]);
  });
  it("mentions: @username, not emails", () => {
    expect(extractMentions("hi @cyr_doge and @Mr_Jay")).toEqual(["cyr_doge", "Mr_Jay"]);
    expect(extractMentions("mail me at a@b.com")).toEqual([]);
  });
  it("market links: full URL or path, pool or prediction", () => {
    expect(extractMarketRef("look https://omdot.fun/pools/btc-150k-2026 now")).toEqual({ kind: "pool", key: "btc-150k-2026" });
    expect(extractMarketRef("/prediction/elections-2026")).toEqual({ kind: "prediction", key: "elections-2026" });
    expect(extractMarketRef("no link here")).toBeNull();
  });
});
