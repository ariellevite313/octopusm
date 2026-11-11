/**
 * Articles longs : format d'écriture (Markdown limité) et règles. Aucun HTML n'est jamais interprété :
 * le texte est découpé en blocs, puis affiché par React (texte échappé). Liens en https seulement,
 * images seulement depuis le stockage de la plateforme.
 *
 * Format accepté :
 *   ## Sous-titre      ### Petit titre      > citation      - liste      1. liste numérotée
 *   **gras**   *italique*   [texte](https://…)   https://… (lien direct)   ![légende](image envoyée)   ---
 */

export const ARTICLE_MAX_CHARS = 20_000;
export const ARTICLE_MIN_CHARS = 50;
export const ARTICLE_TITLE_MIN = 3;
export const ARTICLE_TITLE_MAX = 120;
export const ARTICLE_MAX_IMAGES = 12;
export const ARTICLES_PER_DAY = 3;
export const EXCERPT_CHARS = 280;

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "a"; href: string; c: Inline[] };

export type Block =
  | { t: "h2" | "h3" | "p" | "quote"; c: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "img"; src: string; alt: string }
  | { t: "hr" };

/** Lien autorisé : https (ou chemin interne du site). Tout le reste (javascript:, data:, http:…) est refusé. */
export function safeHref(raw: string): string | null {
  const s = raw.trim();
  if (/^\/(?!\/)[\w\-./?=&%#~]*$/.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch { return null; }
}

/** Préfixe public du stockage des images (mêmes fichiers que les images des posts). */
export function storagePrefix(supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/post-images/`;
}
export function isOwnImage(url: string, prefix = storagePrefix()): boolean {
  return prefix.length > 40 && url.startsWith(prefix) && !url.slice(prefix.length).includes("..") && !/[\s"'<>]/.test(url);
}

// ── Mise en forme dans une ligne ──────────────────────────────────────────────
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => { if (buf) { out.push({ t: "text", v: buf }); buf = ""; } };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\*\*([^*]+?)\*\*/))) { flush(); out.push({ t: "b", c: parseInline(m[1]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^\*([^*\s][^*]*?)\*/))) { flush(); out.push({ t: "i", c: parseInline(m[1]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^\[([^\]]{1,200})\]\(([^)\s]{1,500})\)/))) {
      const href = safeHref(m[2]);
      flush();
      if (href) out.push({ t: "a", href, c: parseInline(m[1]) });
      else out.push({ t: "text", v: m[1] });
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^https:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/)) && (i === 0 || /\s|\(/.test(src[i - 1]))) {
      const href = safeHref(m[0]);
      if (href) { flush(); out.push({ t: "a", href, c: [{ t: "text", v: m[0].replace(/^https:\/\//, "") }] }); i += m[0].length; continue; }
    }
    buf += src[i];
    i += 1;
  }
  flush();
  return out;
}

// ── Blocs ─────────────────────────────────────────────────────────────────────
export function parseArticle(md: string, imagePrefix = storagePrefix()): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { t: "ul" | "ol"; items: Inline[][] } | null = null;
  const endPara = () => { if (para.length) { blocks.push({ t: "p", c: parseInline(para.join(" ")) }); para = []; } };
  const endList = () => { if (list) { blocks.push(list); list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const s = line.trim();
    let m: RegExpMatchArray | null;
    if (!s) { endPara(); endList(); continue; }
    if ((m = s.match(/^!\[([^\]]{0,200})\]\(([^)\s]+)\)$/))) {
      endPara(); endList();
      if (isOwnImage(m[2], imagePrefix)) blocks.push({ t: "img", src: m[2], alt: m[1] });
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(s)) { endPara(); endList(); blocks.push({ t: "hr" }); continue; }
    if ((m = s.match(/^###\s+(.+)$/))) { endPara(); endList(); blocks.push({ t: "h3", c: parseInline(m[1]) }); continue; }
    if ((m = s.match(/^##?\s+(.+)$/))) { endPara(); endList(); blocks.push({ t: "h2", c: parseInline(m[1]) }); continue; }
    if ((m = s.match(/^>\s?(.*)$/))) { endPara(); endList(); blocks.push({ t: "quote", c: parseInline(m[1]) }); continue; }
    if ((m = s.match(/^[-•*]\s+(.+)$/))) {
      endPara();
      if (!list || list.t !== "ul") { endList(); list = { t: "ul", items: [] }; }
      list.items.push(parseInline(m[1])); continue;
    }
    if ((m = s.match(/^\d{1,3}[.)]\s+(.+)$/))) {
      endPara();
      if (!list || list.t !== "ol") { endList(); list = { t: "ol", items: [] }; }
      list.items.push(parseInline(m[1])); continue;
    }
    endList();
    para.push(s);
  }
  endPara(); endList();
  return blocks;
}

const inlineText = (c: Inline[]): string => c.map((x) => (x.t === "text" ? x.v : inlineText(x.c))).join("");

/** Texte simple de l'article (sans mise en forme), pour l'extrait, la durée de lecture et la modération. */
export function articlePlainText(md: string, imagePrefix = storagePrefix()): string {
  return parseArticle(md, imagePrefix).map((b) => {
    if (b.t === "img" || b.t === "hr") return "";
    if ("items" in b) return b.items.map(inlineText).join("\n");
    return inlineText(b.c);
  }).filter(Boolean).join("\n\n");
}

export function makeExcerpt(md: string, imagePrefix = storagePrefix()): string {
  const t = articlePlainText(md, imagePrefix).replace(/\s+/g, " ").trim();
  if (t.length <= EXCERPT_CHARS) return t;
  const cut = t.slice(0, EXCERPT_CHARS);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), EXCERPT_CHARS - 40))}…`;
}

export function readMinutes(md: string, imagePrefix = storagePrefix()): number {
  const words = articlePlainText(md, imagePrefix).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

/** Toutes les images de l'article (Markdown complet). */
export function articleImageUrls(md: string): string[] {
  return [...md.matchAll(/!\[[^\]]{0,200}\]\(([^)\s]+)\)/g)].map((m) => m[1]);
}

export type ArticleInput = { title?: unknown; cover_url?: unknown; body?: unknown };
export type ValidArticle = { title: string; cover_url: string | null; md: string; images: string[] };

export function validateArticle(input: ArticleInput, imagePrefix = storagePrefix()): { ok: true; value: ValidArticle } | { ok: false; error: string } {
  const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : "";
  if (title.length < ARTICLE_TITLE_MIN || title.length > ARTICLE_TITLE_MAX) {
    return { ok: false, error: `The title must be ${ARTICLE_TITLE_MIN} to ${ARTICLE_TITLE_MAX} characters` };
  }
  const md = typeof input.body === "string" ? input.body.replace(/\r\n?/g, "\n").trim() : "";
  if (md.length < ARTICLE_MIN_CHARS) return { ok: false, error: `The article needs at least ${ARTICLE_MIN_CHARS} characters` };
  if (md.length > ARTICLE_MAX_CHARS) return { ok: false, error: `Max ${ARTICLE_MAX_CHARS.toLocaleString("en-US")} characters` };
  let cover_url: string | null = null;
  if (input.cover_url != null && input.cover_url !== "") {
    if (typeof input.cover_url !== "string" || !isOwnImage(input.cover_url, imagePrefix)) return { ok: false, error: "Upload the cover image with the editor" };
    cover_url = input.cover_url;
  }
  const images = articleImageUrls(md);
  if (images.some((u) => !isOwnImage(u, imagePrefix))) return { ok: false, error: "Upload images with the editor" };
  if (images.length + (cover_url ? 1 : 0) > ARTICLE_MAX_IMAGES) return { ok: false, error: `Max ${ARTICLE_MAX_IMAGES} images per article` };
  return { ok: true, value: { title, cover_url, md, images } };
}
