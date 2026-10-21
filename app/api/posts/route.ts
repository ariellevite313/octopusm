/**
 * GET  /api/posts?tab=foryou|following&author=<wallet>&before=<iso>&limit=10
 * POST /api/posts  (multipart: body, images[] ≤ 2 — JPG/PNG/WEBP/GIF ≤ 5 Mo, pas de vidéo)
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { requireWallet } from "@/lib/social/session";
import { enrichPosts, normWallet, POST_COLUMNS, MAX_BODY, MAX_IMAGES, MAX_IMAGE_BYTES, IMAGE_TYPES, TICKER_RE } from "@/lib/social/posts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") === "following" ? "following" : "foryou";
  const authorParam = url.searchParams.get("author");
  const before = url.searchParams.get("before");
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "10") || 10, 1), 30);

  const viewerRaw = await getWalletAddress();
  const viewer = viewerRaw ? normWallet(viewerRaw) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let q = admin.from("posts").select(POST_COLUMNS).eq("hidden", false).order("created_at", { ascending: false }).limit(limit);
  if (before && !Number.isNaN(Date.parse(before))) q = q.lt("created_at", before);

  if (authorParam) {
    q = q.eq("author", normWallet(authorParam));
  } else if (tab === "following") {
    if (!viewer) return NextResponse.json({ posts: [], next: null });
    const { data: f } = await admin.from("follows").select("following").eq("follower", viewer);
    const list = ((f ?? []) as { following: string }[]).map((x) => x.following);
    if (list.length === 0) return NextResponse.json({ posts: [], next: null });
    q = q.in("author", list);
  }

  // Posts masqués par le viewer
  let hiddenIds: string[] = [];
  if (viewer) {
    const { data: h } = await admin.from("post_hides").select("post_id").eq("wallet", viewer);
    hiddenIds = ((h ?? []) as { post_id: string }[]).map((x) => x.post_id);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = ((data ?? []) as { id: string; created_at: string }[]);
  const visible = rows.filter((r) => !hiddenIds.includes(r.id));
  const posts = await enrichPosts(admin, visible as never, viewer);
  const next = rows.length === limit ? rows[rows.length - 1].created_at : null;
  return NextResponse.json({ posts, next });
}

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Invalid form" }, { status: 400 }); }
  const body = String(form.get("body") ?? "").trim();
  const files = (form.getAll("images") as unknown[]).filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);

  if (body.length > MAX_BODY) return NextResponse.json({ error: `Max ${MAX_BODY} characters` }, { status: 400 });
  if (files.length > MAX_IMAGES) return NextResponse.json({ error: `Max ${MAX_IMAGES} images` }, { status: 400 });
  if (!body && files.length === 0) return NextResponse.json({ error: "Empty post" }, { status: 400 });
  for (const f of files) {
    if (!IMAGE_TYPES.includes(f.type)) return NextResponse.json({ error: "Images only (JPG, PNG, WEBP, GIF). No video." }, { status: 400 });
    if (f.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image too large (max 5 MB)" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Limite : 10 publications par heure et par wallet
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("posts").select("id", { count: "exact", head: true }).eq("author", s.wallet).gte("created_at", since);
  if ((count ?? 0) >= 10) return NextResponse.json({ error: "Too many posts, try again later" }, { status: 429 });

  // Wallet doit exister (clé étrangère logique)
  const { data: w } = await admin.from("wallets").select("address").eq("address", s.wallet).maybeSingle();
  if (!w) return NextResponse.json({ error: "Wallet not registered" }, { status: 403 });

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
    const path = `${s.wallet}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage.from("post-images").upload(path, await f.arrayBuffer(), { contentType: f.type });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    urls.push(admin.storage.from("post-images").getPublicUrl(path).data.publicUrl);
  }

  const { data: row, error } = await admin.from("posts").insert({ author: s.wallet, body, images: urls, ticker, token_id: tokenId }).select(POST_COLUMNS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const [post] = await enrichPosts(admin, [row], s.wallet);
  return NextResponse.json({ post }, { status: 201 });
}
