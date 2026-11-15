import { describe, it, expect } from "vitest";
import { linksFrom } from "@/lib/wallet-links";

describe("wallet links", () => {
  it("links a holder to the holder that funded it", () => {
    expect(linksFrom([{ owner: "A", funder: null }, { owner: "B", funder: "A" }])).toEqual([{ a: "A", b: "B", why: "funded" }]);
  });
  it("links holders funded by the same wallet", () => {
    const l = linksFrom([{ owner: "A", funder: "F" }, { owner: "B", funder: "F" }, { owner: "C", funder: "F" }]);
    expect(l.map((x) => x.b)).toEqual(["B", "C"]);
  });
  it("ignores a funder shared by too many holders (exchange)", () => {
    expect(linksFrom(Array.from({ length: 10 }, (_, i) => ({ owner: `W${i}`, funder: "CEX" })))).toEqual([]);
  });
});
