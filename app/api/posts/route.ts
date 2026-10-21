/**
 * GET  /api/posts?tab=foryou|following&author=<wallet>&before=<iso>&limit=10
 * POST /api/posts  (multipart: body, images[] ≤ 2 — JPG/PNG/WEBP/GIF ≤ 5 Mo, pas de vidéo)
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { requireWallet } from "@/lib/social/session";
import { enrichPosts, normWallet, POST_COLUMNS } from "@/lib/social/posts";
import { createPost } from "@/lib/social/create-post";

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

  const r = await createPost(s.wallet, body, files.map((f) => ({ type: f.type, size: f.size, bytes: () => f.arrayBuffer() })));
  return NextResponse.json(r.data, { status: r.status });
}
