/** POST /api/posts/:id/like — bascule le like. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { UUID_RE } from "@/lib/social/posts";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const s = await requireWallet();
  if ("error" in s) return s.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: existing } = await admin.from("post_likes").select("post_id").eq("post_id", id).eq("wallet", s.wallet).maybeSingle();
  if (existing) await admin.from("post_likes").delete().eq("post_id", id).eq("wallet", s.wallet);
  else {
    const { error } = await admin.from("post_likes").insert({ post_id: id, wallet: s.wallet });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const { count } = await admin.from("post_likes").select("post_id", { count: "exact", head: true }).eq("post_id", id);
  await admin.from("posts").update({ like_count: count ?? 0 }).eq("id", id);
  return NextResponse.json({ liked: !existing, like_count: count ?? 0 });
}
