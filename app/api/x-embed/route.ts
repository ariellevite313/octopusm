import { NextResponse } from "next/server";

// Aperçu d'un post X sans clé : texte + média (image, vidéo, GIF) via fxtwitter, sinon oEmbed public.
export const revalidate = 3600;

type Media = { type: "photo" | "video" | "gif"; url: string } | null;

function clean(t: string) {
  return t.replace(/\s+https:\/\/t\.co\/\w+/g, "").trim().slice(0, 400);
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
      const j = await r.json() as { tweet?: { text?: string; author?: { name?: string }; media?: { all?: { type?: string; url?: string; thumbnail_url?: string }[] } } };
      const t = j.tweet;
      if (t) {
        const m0 = t.media?.all?.[0];
        let media: Media = null;
        if (m0) {
          if (m0.type === "photo" && m0.url) media = { type: "photo", url: m0.url };
          else if ((m0.type === "video" || m0.type === "gif") && (m0.thumbnail_url || m0.url)) media = { type: m0.type, url: (m0.thumbnail_url || m0.url) as string };
        }
        return NextResponse.json({ handle, url, author: t.author?.name ?? handle, text: clean(t.text ?? "") || null, media });
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
      return NextResponse.json({ handle, url, author: j.author_name ?? handle, text: text || null, media: null });
    }
  } catch { /* repli ci-dessous */ }
  return NextResponse.json({ handle, url, text: null, media: null });
}
