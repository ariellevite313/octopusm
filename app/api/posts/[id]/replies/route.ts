/** GET/POST /api/posts/:id/replies */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { getProfiles } from "@/lib/profiles";
import { UUID_RE } from "@/lib/social/posts";
import { notify } from "@/lib/social/notify";
import { getWalletAddress } from "@/lib/auth/get-wallet";

const norm = (w: string) => (/^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin.from("post_replies").select("id, author, body, created_at, parent_id, like_count, reply_count").eq("post_id", id).order("created_at", { ascending: true }).limit(300);
  type Row = { id: string; author: string; body: string; created_at: string; parent_id: string | null; like_count: number; reply_count: number };
  const rows = (data ?? []) as Row[];
  const profiles = await getProfiles(admin, rows.map((r) => r.author));
  // Réponses likées par le visiteur
  const viewerRaw = await getWalletAddress().catch(() => null);
  let liked = new Set<string>();
  if (viewerRaw && rows.length) {
    const { data: l } = await admin.from("post_reply_likes").select("reply_id").eq("wallet", norm(viewerRaw)).in("reply_id", rows.map((r) => r.id));
    liked = new Set(((l ?? []) as { reply_id: string }[]).map((x) => x.reply_id));
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  return NextResponse.json({
    replies: rows.map((r) => {
      const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
      return {
        ...r,
        like_count: r.like_count ?? 0,
        reply_count: r.reply_count ?? 0,
        liked_by_me: liked.has(r.id),
        parent_author: parent?.author ?? null,
        parent_author_name: parent ? profiles.get(parent.author)?.name ?? null : null,
        author_name: profiles.get(r.author)?.name ?? null,
        author_avatar: profiles.get(r.author)?.avatar_src ?? null,
        author_token: profiles.get(r.author)?.token ?? null,
        author_octo: profiles.get(r.author)?.octo ?? 0,
      };
    }),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { body, parent_id } = (await req.json().catch(() => ({}))) as { body?: string; parent_id?: string };
  if (parent_id != null && (typeof parent_id !== "string" || !UUID_RE.test(parent_id))) return NextResponse.json({ error: "Invalid parent_id" }, { status: 400 });
  const text = (body ?? "").trim();
  if (!text || text.length > 1000) return NextResponse.json({ error: "Reply must be 1-1000 characters" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await admin.from("post_replies").select("id", { count: "exact", head: true }).eq("author", s.wallet).gte("created_at", since);
  if ((recent ?? 0) >= 8) return NextResponse.json({ error: "Too many replies, slow down" }, { status: 429 });
  const { data: post } = await admin.from("posts").select("id, author").eq("id", id).eq("hidden", false).maybeSingle();
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Réponse à une réponse : le parent doit appartenir au même post
  let parent: { id: string; author: string } | null = null;
  if (parent_id) {
    const { data: p } = await admin.from("post_replies").select("id, author").eq("id", parent_id).eq("post_id", id).maybeSingle();
    if (!p) return NextResponse.json({ error: "Reply not found" }, { status: 404 });
    parent = p;
  }
  const { data: created, error } = await admin.from("post_replies").insert({ post_id: id, author: s.wallet, body: text, parent_id: parent?.id ?? null }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (parent) {
    const { count: rc } = await admin.from("post_replies").select("id", { count: "exact", head: true }).eq("parent_id", parent.id);
    await admin.from("post_replies").update({ reply_count: rc ?? 0 }).eq("id", parent.id);
    await notify([{ wallet: parent.author, kind: "reply_reply", actor: s.wallet, postId: id }]);
  }
  if (!parent || norm(parent.author) !== norm(post.author)) await notify([{ wallet: post.author, kind: "reply", actor: s.wallet, postId: id }]);
  const { count } = await admin.from("post_replies").select("id", { count: "exact", head: true }).eq("post_id", id);
  await admin.from("posts").update({ reply_count: count ?? 0 }).eq("id", id);
  return NextResponse.json({ ok: true, id: created?.id ?? null, reply_count: count ?? 0 }, { status: 201 });
}
