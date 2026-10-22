import { describe, it, expect } from "vitest";
import { rankFeed, scorePost, type RankRow } from "@/lib/social/rank";

const now = Date.parse("2026-10-22T12:00:00Z");
const h = (n: number) => new Date(now - n * 3600_000).toISOString();
const row = (id: string, author: string, hoursAgo: number, likes = 0, replies = 0, extra: Partial<RankRow> = {}): RankRow =>
  ({ id, author, created_at: h(hoursAgo), like_count: likes, reply_count: replies, view_count: 0, repost_count: 0, ...extra });
const ctx = (followed: string[] = [], octo: Record<string, number> = {}, viewer: string | null = null) =>
  ({ now, viewer, followed: new Set(followed), octo: new Map(Object.entries(octo)) });

describe("rankFeed (fil Pour toi)", () => {
  it("un post récent et engageant passe devant un vieux post sans interaction", () => {
    const out = rankFeed([row("old", "a", 40), row("hot", "b", 1, 30, 5)], ctx());
    expect(out[0].id).toBe("hot");
  });
  it("les réponses pèsent plus que les likes", () => {
    expect(scorePost(row("r", "a", 2, 0, 5), ctx())).toBeGreaterThan(scorePost(row("l", "a", 2, 5, 0), ctx()));
  });
  it("comptes suivis et puce de vérification remontent le post", () => {
    const base = scorePost(row("x", "a", 3, 2), ctx());
    expect(scorePost(row("x", "a", 3, 2), ctx(["a"]))).toBeCloseTo(base * 2);
    expect(scorePost(row("x", "a", 3, 2), ctx([], { a: 1500 }))).toBeCloseTo(base * 1.3);
  });
  it("mélange 3 posts suivis pour 2 autres", () => {
    const rows = [...Array(6)].map((_, i) => row(`f${i}`, `fa${i}`, 1)).concat([...Array(6)].map((_, i) => row(`o${i}`, `oa${i}`, 1, 50)));
    const out = rankFeed(rows, ctx(["fa0", "fa1", "fa2", "fa3", "fa4", "fa5"]));
    expect(out.slice(0, 5).map((r) => r.id[0]).join("")).toBe("fffoo");
  });
  it("jamais plus de 2 posts d'affilée du même auteur", () => {
    const rows = [row("a1", "a", 1, 9), row("a2", "a", 1, 8), row("a3", "a", 1, 7), row("b1", "b", 1, 1)];
    const out = rankFeed(rows, ctx());
    expect(out.map((r) => r.author).join("")).toBe("aaba");
  });
  it("un repost ne compte que s'il vient d'un compte suivi, et un post n'apparaît qu'une fois", () => {
    const rows = [row("p", "a", 5, 3), row("rp1", "x", 1, 0, 0, { repost_of: "p" }), row("rp2", "y", 1, 0, 0, { repost_of: "p" })];
    expect(rankFeed(rows, ctx()).map((r) => r.id)).toEqual(["p"]);
    const withFollow = rankFeed(rows, ctx(["y"]));
    expect(withFollow).toHaveLength(1);
  });
});
