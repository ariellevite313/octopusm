import { NextResponse } from "next/server";

// Aperçu d'un post X sans clé : texte + média (image, vidéo, GIF) via fxtwitter, sinon oEmbed public.
export const revalidate = 3600;

type Media = { type: "photo" | "video" | "gif"; url: string } | null;

const ARTICLE_RE = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/article\/\d+\S*/gi;

function clean(t: string) {
  return t.replace(/\s*https:\/\/t\.co\/\w+/g, "").replace(ARTICLE_RE, "").trim().slice(0, 400);
}

type Article = { title: string; text: string | null } | null;

/** Les articles X (x.com/i/article/...) : titre, extrait et image de couverture quand fxtwitter les fournit. */
function readArticle(a: unknown): { article: Article; cover: string | null } {
  if (!a || typeof a !== "object") return { article: null, cover: null };
  const o = a as Record<string, any>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const text = typeof o.preview_text === "string" ? o.preview_text.trim().slice(0, 300) : null;
  const cm = o.cover_media ?? o.cover ?? null;
  const cover = cm?.media_info?.original_img_url ?? cm?.media_info?.url ?? cm?.url ?? (typeof o.image === "string" ? o.image : null);
  return { article: title ? { title, text: text || null } : null, cover: typeof cover === "string" ? cover : null };
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const handle = u.searchParams.get("handle") ?? "";
  const id = u.searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle) || !/^\d{5,25}$/.test(id)) return NextResponse.json({ error: "bad" }, { status: 400 });
  const url = `https://x.com/${handle}/status/${id}`;

  try {
    const r = await fetch(`https://api.fxtwitter.com/${handle}/status/${id}`, { next: { revalidate: 3600 }, headers: { "User-Agent": "OMdotfun-linkpreview" } });
    if (r.ok) {
      const j = await r.json() as { tweet?: { text?: string; author?: { name?: string }; article?: unknown; media?: { all?: { type?: string; url?: string; thumbnail_url?: string }[] } } };
      const t = j.tweet;
      if (t) {
        const m0 = t.media?.all?.[0];
        let media: Media = null;
        if (m0) {
          if (m0.type === "photo" && m0.url) media = { type: "photo", url: m0.url };
          else if ((m0.type === "video" || m0.type === "gif") && (m0.thumbnail_url || m0.url)) media = { type: m0.type, url: (m0.thumbnail_url || m0.url) as string };
        }
        const { article, cover } = readArticle(t.article);
        if (!media && cover) media = { type: "photo", url: cover };
        const isArticle = !!article || ARTICLE_RE.test(t.text ?? "");
        ARTICLE_RE.lastIndex = 0;
        return NextResponse.json({ handle, url, author: t.author?.name ?? handle, text: clean(t.text ?? "") || null, media, article, isArticle });
      }
    }
  } catch { /* on tente oEmbed */ }

  try {
    const r = await fetch(`https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(url)}`, { next: { revalidate: 3600 } });
    if (r.ok) {
      const j = await r.json() as { author_name?: string; html?: string };
      const p = (j.html ?? "").match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
      const text = clean(p.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, "-"));
      const isArticle = ARTICLE_RE.test(p);
      ARTICLE_RE.lastIndex = 0;
      return NextResponse.json({ handle, url, author: j.author_name ?? handle, text: text || null, media: null, article: null, isArticle });
    }
  } catch { /* repli ci-dessous */ }
  return NextResponse.json({ handle, url, text: null, media: null });
}
