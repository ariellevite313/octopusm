/** POST /api/articles  { title, cover_url?, body } — publie un article long dans le fil. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { moderateText } from "@/lib/moderation";
import { ARTICLES_PER_DAY, articlePlainText, makeExcerpt, readMinutes, validateArticle } from "@/lib/social/article";

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;

  const input = await req.json().catch(() => null);
  if (!input || typeof input !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const v = validateArticle(input);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: w } = await admin.from("wallets").select("address").eq("address", s.wallet).maybeSingle();
  if (!w) return NextResponse.json({ error: "Wallet not registered" }, { status: 403 });

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("posts").select("id", { count: "exact", head: true }).eq("author", s.wallet).eq("kind", "article").gte("created_at", since);
  if ((count ?? 0) >= ARTICLES_PER_DAY) return NextResponse.json({ error: `You can publish ${ARTICLES_PER_DAY} articles per 24 hours` }, { status: 429 });

  const plain = articlePlainText(v.value.md);
  if ((await moderateText(`${v.value.title}\n\n${plain}`.slice(0, 12_000))) === "blocked") {
    return NextResponse.json({ error: "This article goes against our rules" }, { status: 400 });
  }

  const { data, error } = await admin.from("posts").insert({
    author: s.wallet,
    kind: "article",
    title: v.value.title,
    cover_url: v.value.cover_url,
    article_md: v.value.md,
    article_images: v.value.images,
    read_minutes: readMinutes(v.value.md),
    body: makeExcerpt(v.value.md) || v.value.title,
    images: [],
    images_checked: true,
  }).select("id").single();
  if (error) {
    console.error("[articles]", error.message);
    return NextResponse.json({ error: "Could not publish the article" }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}
