/**
 * Éditeur visuel des articles : transforme le contenu de la zone d'écriture (DOM) en texte au format des articles
 * (voir lib/social/article.ts). Seuls les éléments connus sont gardés ; tout le reste devient du texte simple.
 * Écrit sur une interface minimale de nœud pour être testé sans navigateur.
 */
export type MiniNode = {
  nodeType: number;            // 1 = élément, 3 = texte
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<MiniNode>;
  getAttribute?: (n: string) => string | null;
  style?: { fontWeight?: string; fontStyle?: string; textDecoration?: string; textDecorationLine?: string };
};

const BLOCKS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "UL", "OL", "LI", "FIGURE", "HR", "IMG", "SECTION", "ARTICLE"]);
const kids = (n: MiniNode) => Array.from(n.childNodes as ArrayLike<MiniNode>);

function inline(n: MiniNode): string {
  if (n.nodeType === 3) return (n.textContent ?? "").replace(/\s+/g, " ");
  if (n.nodeType !== 1) return "";
  const name = n.nodeName.toUpperCase();
  if (name === "BR") return " ";
  if (name === "IMG") return "";
  const inner = kids(n).map(inline).join("");
  if (!inner.trim()) return inner;
  const wrap = (m: string) => {
    const lead = inner.match(/^\s*/)![0], trail = inner.match(/\s*$/)![0];
    return `${lead}${m}${inner.trim()}${m}${trail}`;
  };
  const st = n.style ?? {};
  const deco = `${st.textDecoration ?? ""} ${st.textDecorationLine ?? ""}`;
  if (name === "B" || name === "STRONG" || Number(st.fontWeight) >= 600 || st.fontWeight === "bold") return wrap("**");
  if (name === "I" || name === "EM" || st.fontStyle === "italic") return wrap("*");
  if (name === "S" || name === "STRIKE" || name === "DEL" || deco.includes("line-through")) return wrap("~~");
  if (name === "A") {
    const href = n.getAttribute?.("href") ?? "";
    return /^https:\/\//i.test(href) || href.startsWith("/") ? `[${inner.trim()}](${href})` : inner;
  }
  return inner;
}

function imageOf(n: MiniNode): string | null {
  const name = n.nodeName.toUpperCase();
  if (name === "IMG") {
    const src = n.getAttribute?.("src") ?? "";
    const alt = (n.getAttribute?.("alt") ?? "").replace(/[[\]\n]/g, " ").trim();
    return src ? `![${alt}](${src})` : null;
  }
  for (const c of kids(n)) {
    if (c.nodeType === 1) { const r = imageOf(c); if (r) return r; }
  }
  return null;
}

function block(n: MiniNode, out: string[]) {
  if (n.nodeType === 3) {
    const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) out.push(t);
    return;
  }
  if (n.nodeType !== 1) return;
  const name = n.nodeName.toUpperCase();
  const text = () => kids(n).map(inline).join("").replace(/\s+/g, " ").trim();
  switch (name) {
    case "H1": case "H2": { const t = text(); if (t) out.push(`## ${t}`); return; }
    case "H3": case "H4": { const t = text(); if (t) out.push(`### ${t}`); return; }
    case "BLOCKQUOTE": { const t = text(); if (t) out.push(`> ${t}`); return; }
    case "HR": out.push("---"); return;
    case "IMG": case "FIGURE": { const im = imageOf(n); if (im) out.push(im); return; }
    case "UL": case "OL": {
      const items = kids(n).filter((c) => c.nodeType === 1 && c.nodeName.toUpperCase() === "LI")
        .map((li) => kids(li).map(inline).join("").replace(/\s+/g, " ").trim()).filter(Boolean);
      if (items.length) out.push(items.map((t, i) => (name === "UL" ? `- ${t}` : `${i + 1}. ${t}`)).join("\n"));
      return;
    }
    default: {
      // Paragraphe (P, DIV…) : s'il contient des blocs (copier-coller, listes imbriquées), on les traite un par un
      const hasBlock = kids(n).some((c) => c.nodeType === 1 && BLOCKS.has(c.nodeName.toUpperCase()));
      if (hasBlock) {
        let run: MiniNode[] = [];
        const flush = () => { const t = run.map(inline).join("").replace(/\s+/g, " ").trim(); if (t) out.push(t); run = []; };
        for (const c of kids(n)) {
          if (c.nodeType === 1 && BLOCKS.has(c.nodeName.toUpperCase())) { flush(); block(c, out); } else run.push(c);
        }
        flush();
        return;
      }
      const im = kids(n).some((c) => c.nodeType === 1 && c.nodeName.toUpperCase() === "IMG") ? imageOf(n) : null;
      const t = text();
      if (t) out.push(t);
      if (im) out.push(im);
    }
  }
}

/** Contenu de l'éditeur → texte de l'article. */
export function domToArticle(root: MiniNode): string {
  const out: string[] = [];
  let run: MiniNode[] = [];
  const flush = () => { const t = run.map(inline).join("").replace(/\s+/g, " ").trim(); if (t) out.push(t); run = []; };
  for (const c of kids(root)) {
    if (c.nodeType === 1 && BLOCKS.has(c.nodeName.toUpperCase())) { flush(); block(c, out); } else run.push(c);
  }
  flush();
  return out.join("\n\n");
}
