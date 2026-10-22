import { describe, it, expect } from "vitest";
import { buildThreads } from "@/lib/social/reply-threads";

const r = (id: string, created_at: string, parent_id: string | null = null, author_octo = 0) => ({ id, created_at, parent_id, author_octo });

describe("buildThreads", () => {
  it("groups nested replies under their top-level reply, in date order", () => {
    const t = buildThreads([
      r("a", "2026-10-22T10:00:00Z"),
      r("b", "2026-10-22T10:01:00Z"),
      r("a1", "2026-10-22T10:02:00Z", "a"),
      r("a1x", "2026-10-22T10:03:00Z", "a1"),
      r("b1", "2026-10-22T10:04:00Z", "b"),
    ]);
    expect(t.map((x) => x.root.id)).toEqual(["a", "b"]);
    expect(t[0].children.map((c) => c.id)).toEqual(["a1", "a1x"]);
    expect(t[1].children.map((c) => c.id)).toEqual(["b1"]);
  });
  it("puts verified roots first and treats orphans as roots", () => {
    const t = buildThreads([r("a", "2026-10-22T10:00:00Z"), r("v", "2026-10-22T10:05:00Z", null, 1500), r("o", "2026-10-22T10:06:00Z", "gone")]);
    expect(t.map((x) => x.root.id)).toEqual(["v", "a", "o"]);
  });
});
