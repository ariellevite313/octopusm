/**
 * GET  /api/posts?tab=foryou|following&author=<wallet>&before=<iso | o:offset>&limit=10
 *      « Pour toi » (sans author ni tag) : posts des 3 derniers jours classés (voir lib/social/rank.ts),
 *      pagination par décalage « o:N », puis le reste dans l'ordre chronologique.
 * POST /api/posts  (multipart: body, images[] ≤ 2 — JPG/PNG/WEBP/GIF ≤ 5 Mo, pas de vidéo)
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { requireWallet } from "@/lib/social/session";
import { enrichPosts, normWallet, POST_COLUMNS } from "@/lib/social/posts";
import { createPost } from "@/lib/social/create-post";
import { rankFeed, type RankRow } from "@/lib/social/rank";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") === "following" ? "following" : "foryou";
  const authorParam = url.searchParams.get("author");
  let before = url.searchParams.get("before");
  const tag = (url.searchParams.get("tag") ?? "").replace(/^#/, "").toLowerCase().slice(0, 30);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "10") || 10, 1), 30);

  const viewerRaw = await getWalletAddress();
  const viewer = viewerRaw ? normWallet(viewerRaw) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Posts masqués par le viewer
  let hiddenIds: string[] = [];
  if (viewer) {
    const { data: h } = await admin.from("post_hides").select("post_id").eq("wallet", viewer);
    hiddenIds = ((h ?? []) as { post_id: string }[]).map((x) => x.post_id);
  }

  // Fil classé « Pour toi »
  const RANK_HOURS = 72;
  const cutoff = new Date(Date.now() - RANK_HOURS * 3600_000).toISOString();
  if (tab === "foryou" && !authorParam && !tag && (!before || before.startsWith("o:"))) {
    const offset = before ? Math.max(0, parseInt(before.slice(2)) || 0) : 0;
    const [{ data: cand }, fol] = await Promise.all([
      admin.from("posts").select(POST_COLUMNS).eq("hidden", false).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(400),
      viewer ? admin.from("follows").select("following").eq("follower", viewer) : Promise.resolve({ data: [] }),
    ]);
    const rows = ((cand ?? []) as (RankRow & Record<string, unknown>)[]).filter((r) => !hiddenIds.includes(r.id));
    const authors = [...new Set(rows.map((r) => r.author))];
    const { data: oc } = authors.length ? await admin.from("leaderboard_octo").select("wallet_address, total_octo").in("wallet_address", authors) : { data: [] };
    const ranked = rankFeed(rows, {
      now: Date.now(), viewer,
      followed: new Set(((fol.data ?? []) as { following: string }[]).map((f) => f.following)),
      octo: new Map(((oc ?? []) as { wallet_address: string; total_octo: number }[]).map((o) => [o.wallet_address, Number(o.total_octo) || 0])),
    });
    if (offset < ranked.length) {
      const page = ranked.slice(offset, offset + limit);
      const posts = await enrichPosts(admin, page as never, viewer);
      // Fin du classement : on continue avec les posts plus anciens, dans l'ordre
      const next = offset + limit < ranked.length ? `o:${offset + limit}` : cutoff;
      return NextResponse.json({ posts, next });
    }
    before = cutoff;
  }

  let q = admin.from("posts").select(POST_COLUMNS).eq("hidden", false).order("created_at", { ascending: false }).limit(limit);
  if (before && !Number.isNaN(Date.parse(before))) q = q.lt("created_at", before);
  if (tag) q = q.contains("tags", [tag]);

  if (authorParam) {
    q = q.eq("author", normWallet(authorParam));
    // Onglets du profil : posts (sans les reposts), reposts, médias (posts avec image)
    const kind = url.searchParams.get("kind");
    if (kind === "posts") q = q.is("repost_of", null);
    else if (kind === "reposts") q = q.not("repost_of", "is", null);
    else if (kind === "media") q = q.is("repost_of", null).neq("images", "{}");
  } else if (tab === "following") {
    if (!viewer) return NextResponse.json({ posts: [], next: null });
    const { data: f } = await admin.from("follows").select("following").eq("follower", viewer);
    const list = ((f ?? []) as { following: string }[]).map((x) => x.following);
    if (list.length === 0) return NextResponse.json({ posts: [], next: null });
    q = q.in("author", list);
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

  const quoteOf = String(form.get("quote_of") ?? "").trim() || null;
  const r = await createPost(s.wallet, body, files.map((f) => ({ type: f.type, size: f.size, bytes: () => f.arrayBuffer() })), { quoteOf });
  return NextResponse.json(r.data, { status: r.status });
}
