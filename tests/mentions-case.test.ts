import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("mentions", () => {
  it("la recherche des noms est insensible à la casse (@cyrdoge trouve CyrDOGE)", () => {
    const src = readFileSync("lib/social/create-post.ts", "utf8");
    expect(src).toContain("username.ilike.");
    expect(src).not.toMatch(/\.in\("username"/);
  });
});
