/** Articles longs : découpage du texte (sans HTML), liens et images sûrs, extrait, durée, validation. */
import { describe, it, expect } from "vitest";
import { parseArticle, parseInline, safeHref, isOwnImage, makeExcerpt, readMinutes, validateArticle, EXCERPT_CHARS } from "@/lib/social/article";

const PREFIX = "https://db.omdot.fun/storage/v1/object/public/post-images/";
const IMG = `${PREFIX}wallet/articles/a.png`;

describe("safeHref", () => {
  it("accepts https and internal paths only", () => {
    expect(safeHref("https://omdot.fun/agents")).toBe("https://omdot.fun/agents");
    expect(safeHref("/hackathon")).toBe("/hackathon");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://x.com", "//evil.com", "https://user:pw@x.com", "vbscript:x"]) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});

describe("parseInline", () => {
  it("handles bold, italic, links and bare https links", () => {
    expect(parseInline("a **b** *c* [d](https://e.com) https://f.com/x.")).toEqual([
      { t: "text", v: "a " }, { t: "b", c: [{ t: "text", v: "b" }] }, { t: "text", v: " " },
      { t: "i", c: [{ t: "text", v: "c" }] }, { t: "text", v: " " },
      { t: "a", href: "https://e.com/", c: [{ t: "text", v: "d" }] }, { t: "text", v: " " },
      { t: "a", href: "https://f.com/x", c: [{ t: "text", v: "f.com/x" }] }, { t: "text", v: "." },
    ]);
  });
  it("turns a dangerous link into plain text", () => {
    expect(parseInline("[click](javascript:alert(1))")[0]).toEqual({ t: "text", v: "click" });
  });
  it("keeps HTML as plain text (React escapes it)", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([{ t: "text", v: "<script>alert(1)</script>" }]);
  });
});

describe("parseArticle", () => {
  it("builds headings, paragraphs, lists, quotes, rules and own images", () => {
    const md = `## Title\nline one\nline two\n\n- a\n- b\n\n1. x\n2. y\n\n> said\n\n---\n\n![cap](${IMG})\n\n![x](https://evil.com/a.png)`;
    const b = parseArticle(md, PREFIX);
    expect(b.map((x) => x.t)).toEqual(["h2", "p", "ul", "ol", "quote", "hr", "img"]);
    expect(b[1]).toEqual({ t: "p", c: [{ t: "text", v: "line one line two" }] });
    expect(b[6]).toEqual({ t: "img", src: IMG, alt: "cap" });
  });
});

describe("isOwnImage", () => {
  it("only accepts our storage", () => {
    expect(isOwnImage(IMG, PREFIX)).toBe(true);
    expect(isOwnImage("https://evil.com/storage/v1/object/public/post-images/x.png", PREFIX)).toBe(false);
    expect(isOwnImage(`${PREFIX}../secret.png`, PREFIX)).toBe(false);
    expect(isOwnImage(IMG, "")).toBe(false);
  });
});

describe("excerpt and reading time", () => {
  it("excerpt is plain text and short", () => {
    const md = `## Heading\n\n**Bold** start. ${"word ".repeat(200)}`;
    const ex = makeExcerpt(md, PREFIX);
    expect(ex.startsWith("Heading Bold start.")).toBe(true);
    expect(ex.length).toBeLessThanOrEqual(EXCERPT_CHARS + 1);
    expect(ex.endsWith("…")).toBe(true);
  });
  it("counts about 220 words per minute, at least 1", () => {
    expect(readMinutes("hello", PREFIX)).toBe(1);
    expect(readMinutes("w ".repeat(1000), PREFIX)).toBe(5);
  });
});

describe("validateArticle", () => {
  const body = "x".repeat(60);
  it("accepts a valid article", () => {
    const r = validateArticle({ title: "  My   title ", body: `${body}\n\n![](${IMG})`, cover_url: IMG }, PREFIX);
    expect(r).toEqual({ ok: true, value: { title: "My title", cover_url: IMG, md: `${body}\n\n![](${IMG})`, images: [IMG] } });
  });
  it.each([
    [{ title: "ab", body }, /title/],
    [{ title: "Good title", body: "short" }, /at least/],
    [{ title: "Good title", body: "x".repeat(20001) }, /Max/],
    [{ title: "Good title", body, cover_url: "https://evil.com/a.png" }, /cover/],
    [{ title: "Good title", body: `${body}\n![](https://evil.com/a.png)` }, /Upload images/],
  ])("rejects %j", (input, re) => {
    const r = validateArticle(input, PREFIX);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(re);
  });
});
