/**
 * Création d'un post (utilisée par la route /api/posts et par l'outil MCP create_post).
 * Valide le contenu, applique la limite horaire, détecte le $TICKER et envoie les images.
 */
import { createAdminClient } from "@/lib/supabase/server";
import { enrichPosts, POST_COLUMNS, MAX_BODY, MAX_IMAGES, MAX_IMAGE_BYTES, IMAGE_TYPES, TICKER_RE } from "@/lib/social/posts";

export type PostFile = { type: string; size: number; bytes: () => Promise<ArrayBuffer> };
type Result = { status: number; data: Record<string, unknown> };

export async function createPost(wallet: string, bodyIn: string, files: PostFile[]): Promise<Result> {
  const body = bodyIn.trim();
  const err = (status: number, error: string): Result => ({ status, data: { error } });

  if (body.length > MAX_BODY) return err(400, `Max ${MAX_BODY} characters`);
  if (files.length > MAX_IMAGES) return err(400, `Max ${MAX_IMAGES} images`);
  if (!body && files.length === 0) return err(400, "Empty post");
  for (const f of files) {
    if (!IMAGE_TYPES.includes(f.type)) return err(400, "Images only (JPG, PNG, WEBP, GIF). No video.");
    if (f.size > MAX_IMAGE_BYTES) return err(400, "Image too large (max 5 MB)");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Limite : 10 publications par heure et par wallet
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("posts").select("id", { count: "exact", head: true }).eq("author", wallet).gte("created_at", since);
  if ((count ?? 0) >= 10) return err(429, "Too many posts, try again later");

  const { data: w } = await admin.from("wallets").select("address").eq("address", wallet).maybeSingle();
  if (!w) return err(403, "Wallet not registered");

  // Token mentionné ($TICKER) : seulement s'il existe sur la plateforme
  let ticker: string | null = null;
  let tokenId: string | null = null;
  const m = body.match(TICKER_RE);
  if (m) {
    const { data: t } = await admin.from("launchpad_tokens").select("id, ticker").ilike("ticker", m[1]).in("status", ["active", "graduating", "graduated"]).maybeSingle();
    if (t) { ticker = t.ticker; tokenId = t.id; }
  }

  const urls: string[] = [];
  for (const f of files) {
    const ext = f.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${wallet}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage.from("post-images").upload(path, await f.bytes(), { contentType: f.type });
    if (upErr) return err(500, upErr.message);
    urls.push(admin.storage.from("post-images").getPublicUrl(path).data.publicUrl);
  }

  const { data: row, error } = await admin.from("posts").insert({ author: wallet, body, images: urls, ticker, token_id: tokenId }).select(POST_COLUMNS).single();
  if (error) return err(500, error.message);
  const [post] = await enrichPosts(admin, [row], wallet);
  return { status: 201, data: { post } };
}
