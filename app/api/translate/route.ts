/**
 * POST /api/translate  { kind: "post" | "reply", id, lang }  ->  { text }
 * Traduit un post ou une réponse du fil. Le texte est relu en base (jamais envoyé par le client),
 * donc cette route ne sert pas de traducteur gratuit pour n'importe quel texte. Résultat mis en cache.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { TRANSLATE_LANGS, translateText, translationConfigured } from "@/lib/social/translate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({})) as { kind?: string; id?: string; lang?: string };
    const kind = b.kind === "reply" ? "reply" : b.kind === "post" ? "post" : null;
    if (!kind || !b.id || !UUID.test(b.id) || !b.lang || !TRANSLATE_LANGS[b.lang]) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Cache d'abord (si la table n'existe pas encore, on continue sans)
    const { data: cached } = await admin.from("content_translations").select("text").eq("kind", kind).eq("ref_id", b.id).eq("lang", b.lang).maybeSingle();
    if (cached?.text) return NextResponse.json({ text: cached.text });

    if (!translationConfigured()) return NextResponse.json({ error: "Translation is not available yet" }, { status: 503 });

    const q = kind === "post"
      ? admin.from("posts").select("body").eq("id", b.id).eq("hidden", false)
      : admin.from("post_replies").select("body").eq("id", b.id);
    const { data: row } = await q.maybeSingle();
    const body = (row?.body as string | undefined)?.slice(0, 2000);
    if (!body) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const text = await translateText(body, b.lang);
    if (!text) return NextResponse.json({ error: "Translation failed" }, { status: 502 });

    await admin.from("content_translations").upsert({ kind, ref_id: b.id, lang: b.lang, text }, { onConflict: "kind,ref_id,lang" });
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[translate]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
