/** Éditeur visuel : le contenu de la zone d'écriture devient le texte d'article attendu. */
import { describe, it, expect } from "vitest";
import { domToArticle, type MiniNode } from "@/lib/social/article-dom";

const t = (v: string): MiniNode => ({ nodeType: 3, nodeName: "#text", textContent: v, childNodes: [] });
const el = (name: string, children: MiniNode[] = [], attrs: Record<string, string> = {}, style?: MiniNode["style"]): MiniNode => ({
  nodeType: 1, nodeName: name, textContent: null, childNodes: children, getAttribute: (n) => attrs[n] ?? null, style,
});

describe("domToArticle", () => {
  it("converts headings, paragraphs, inline styles, lists, quotes and images", () => {
    const root = el("DIV", [
      t("First line "),
      el("B", [t("bold")]),
      el("H2", [t("Section")]),
      el("P", [t("A "), el("I", [t("small")]), t(" and "), el("S", [t("old")]), t(" "), el("A", [t("link")], { href: "https://omdot.fun" })]),
      el("H3", [t("Sub")]),
      el("UL", [el("LI", [t("one")]), el("LI", [el("STRONG", [t("two")])])]),
      el("OL", [el("LI", [t("x")]), el("LI", [t("y")])]),
      el("BLOCKQUOTE", [t("quote")]),
      el("FIGURE", [el("IMG", [], { src: "https://db/img.png", alt: "" })]),
      el("DIV", [el("BR")]),
    ]);
    expect(domToArticle(root)).toBe([
      "First line **bold**",
      "## Section",
      "A *small* and ~~old~~ [link](https://omdot.fun)",
      "### Sub",
      "- one\n- **two**",
      "1. x\n2. y",
      "> quote",
      "![](https://db/img.png)",
    ].join("\n\n"));
  });

  it("keeps only safe links and reads styled spans", () => {
    const root = el("DIV", [el("P", [
      el("A", [t("bad")], { href: "javascript:alert(1)" }), t(" "),
      el("SPAN", [t("heavy")], {}, { fontWeight: "700" }), t(" "),
      el("SPAN", [t("gone")], {}, { textDecorationLine: "line-through" }),
    ])]);
    expect(domToArticle(root)).toBe("bad **heavy** ~~gone~~");
  });

  it("drops unknown tags but keeps their text", () => {
    const root = el("DIV", [el("P", [el("SCRIPT", [t("alert(1)")]), el("FONT", [t(" hi")])])]);
    expect(domToArticle(root)).toBe("alert(1) hi");
  });
});
