/**
 * Création d'un post (utilisée par la route /api/posts et par l'outil MCP create_post).
 * Valide le contenu, applique la limite horaire, détecte le $TICKER et envoie les images.
 */
import { createAdminClient } from "@/lib/supabase/server";
import { moderateImage, moderateText, sniffImage } from "@/lib/moderation";
import { extractMarketRef, extractMentions, extractTags } from "@/lib/social/rich";
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

  // #hashtags, @mentions (comptes existants uniquement), marché OMdotfun partagé par lien
  const tags = extractTags(body);
  const mentions: Record<string, string> = {};
  const names = extractMentions(body);
  if (names.length) {
    const { data: ws } = await admin.from("wallets").select("address, username").in("username", [...new Set([...names, ...names.map((n) => n.toLowerCase())])]);
    for (const w of (ws ?? []) as { address: string; username: string }[]) {
      const hit = names.find((n) => n.toLowerCase() === w.username.toLowerCase());
      if (hit) mentions[hit.toLowerCase()] = w.address;
    }
  }
  let market_kind: "pool" | "prediction" | null = null;
  let market_id: string | null = null;
  const ref = extractMarketRef(body);
  if (ref) {
    const table = ref.kind === "pool" ? "mutuel_markets" : "prediction_markets";
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref.key);
    const { data: m } = await admin.from(table).select("id").eq(isUuid ? "id" : "slug", ref.key).maybeSingle();
    if (m) { market_kind = ref.kind; market_id = m.id; }
  }

  // Contrôle du texte, puis des images (octets réels, type réel)
  if ((await moderateText(body)) === "blocked") return err(400, "This post goes against our rules");
  let allChecked = files.length > 0;
  const urls: string[] = [];
  for (const f of files) {
    const bytes = await f.bytes();
    const real = sniffImage(new Uint8Array(bytes));
    if (!real) return err(400, "This file is not a valid image (JPG, PNG, WEBP, GIF)");
    const verdict = await moderateImage(bytes, real);
    if (verdict === "blocked") return err(400, "This image goes against our rules");
    if (verdict !== "ok") allChecked = false;
    const ext = real.split("/")[1].replace("jpeg", "jpg");
    const path = `${wallet}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage.from("post-images").upload(path, bytes, { contentType: real });
    if (upErr) return err(500, upErr.message);
    urls.push(admin.storage.from("post-images").getPublicUrl(path).data.publicUrl);
  }

  const { data: row, error } = await admin.from("posts").insert({ author: wallet, body, images: urls, ticker, token_id: tokenId, tags, mentions, market_kind, market_id, images_checked: files.length === 0 || allChecked }).select(POST_COLUMNS).single();
  if (error) return err(500, error.message);
  const [post] = await enrichPosts(admin, [row], wallet);
  return { status: 201, data: { post } };
}
