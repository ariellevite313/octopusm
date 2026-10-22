/** GET/POST /api/posts/:id/replies */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { getProfiles } from "@/lib/profiles";
import { UUID_RE } from "@/lib/social/posts";
import { notify } from "@/lib/social/notify";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin.from("post_replies").select("id, author, body, created_at").eq("post_id", id).order("created_at", { ascending: true }).limit(200);
  const rows = (data ?? []) as { id: string; author: string; body: string; created_at: string }[];
  const profiles = await getProfiles(admin, rows.map((r) => r.author));
  return NextResponse.json({
    replies: rows.map((r) => ({ ...r, author_name: profiles.get(r.author)?.name ?? null, author_avatar: profiles.get(r.author)?.avatar_src ?? null, author_token: profiles.get(r.author)?.token ?? null, author_octo: profiles.get(r.author)?.octo ?? 0 })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { body } = (await req.json().catch(() => ({}))) as { body?: string };
  const text = (body ?? "").trim();
  if (!text || text.length > 1000) return NextResponse.json({ error: "Reply must be 1-1000 characters" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await admin.from("post_replies").select("id", { count: "exact", head: true }).eq("author", s.wallet).gte("created_at", since);
  if ((recent ?? 0) >= 8) return NextResponse.json({ error: "Too many replies, slow down" }, { status: 429 });
  const { data: post } = await admin.from("posts").select("id, author").eq("id", id).eq("hidden", false).maybeSingle();
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error } = await admin.from("post_replies").insert({ post_id: id, author: s.wallet, body: text });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await notify([{ wallet: post.author, kind: "reply", actor: s.wallet, postId: id }]);
  const { count } = await admin.from("post_replies").select("id", { count: "exact", head: true }).eq("post_id", id);
  await admin.from("posts").update({ reply_count: count ?? 0 }).eq("id", id);
  return NextResponse.json({ ok: true, reply_count: count ?? 0 }, { status: 201 });
}
