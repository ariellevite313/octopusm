/**
 * Publication d'un article (et envoi de ses images) : partagé par le site (/api/articles) et le MCP (create_article).
 */
import { createAdminClient } from "@/lib/supabase/server";
import { moderateImage, moderateText, sniffImage } from "@/lib/moderation";
import { rateHit } from "@/lib/rate-limit";
import { MAX_IMAGE_BYTES } from "@/lib/social/posts";
import { ARTICLES_PER_DAY, articlePlainText, makeExcerpt, readMinutes, validateArticle } from "@/lib/social/article";

export type Res = { status: number; data: Record<string, unknown> };

/** Envoie une image d'article (couverture ou image du texte) ; renvoie son URL publique. */
export async function uploadArticleImage(wallet: string, bytes: ArrayBuffer): Promise<Res> {
  if (!(await rateHit(`article-img:${wallet}`, 40, 3600_000))) return { status: 429, data: { error: "Too many uploads, try again later" } };
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { status: 400, data: { error: "Image too large (max 5 MB)" } };
  const real = sniffImage(new Uint8Array(bytes));
  if (!real) return { status: 400, data: { error: "This file is not a valid image (JPG, PNG, WEBP, GIF)" } };
  if ((await moderateImage(bytes, real)) === "blocked") return { status: 400, data: { error: "This image goes against our rules" } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const path = `${wallet}/articles/${crypto.randomUUID()}.${real.split("/")[1].replace("jpeg", "jpg")}`;
  const { error } = await admin.storage.from("post-images").upload(path, bytes, { contentType: real });
  if (error) return { status: 500, data: { error: "Upload failed, try again" } };
  return { status: 200, data: { url: admin.storage.from("post-images").getPublicUrl(path).data.publicUrl } };
}

/** Publie un article { title, cover_url?, body (markdown) } au nom du wallet. */
export async function createArticle(wallet: string, input: Record<string, unknown>): Promise<Res> {
  const v = validateArticle(input);
  if (!v.ok) return { status: 400, data: { error: v.error } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: w } = await admin.from("wallets").select("address").eq("address", wallet).maybeSingle();
  if (!w) return { status: 403, data: { error: "Wallet not registered" } };

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("posts").select("id", { count: "exact", head: true }).eq("author", wallet).eq("kind", "article").gte("created_at", since);
  if ((count ?? 0) >= ARTICLES_PER_DAY) return { status: 429, data: { error: `You can publish ${ARTICLES_PER_DAY} articles per 24 hours` } };

  const plain = articlePlainText(v.value.md);
  if ((await moderateText(`${v.value.title}\n\n${plain}`.slice(0, 12_000))) === "blocked") return { status: 400, data: { error: "This article goes against our rules" } };

  const { data, error } = await admin.from("posts").insert({
    author: wallet, kind: "article", title: v.value.title, cover_url: v.value.cover_url, article_md: v.value.md,
    article_images: v.value.images, read_minutes: readMinutes(v.value.md), body: makeExcerpt(v.value.md) || v.value.title, images: [], images_checked: true,
  }).select("id").single();
  if (error) { console.error("[articles]", error.message); return { status: 500, data: { error: "Could not publish the article" } }; }
  return { status: 200, data: { id: data.id } };
}
