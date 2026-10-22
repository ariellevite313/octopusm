/** POST /api/posts/:id/replies/:replyId/like — bascule le like d'une réponse. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { UUID_RE } from "@/lib/social/posts";
import { notify } from "@/lib/social/notify";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; replyId: string }> }) {
  const { id, replyId } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(replyId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const s = await requireWallet();
  if ("error" in s) return s.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: reply } = await admin.from("post_replies").select("id, author").eq("id", replyId).eq("post_id", id).maybeSingle();
  if (!reply) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: existing } = await admin.from("post_reply_likes").select("reply_id").eq("reply_id", replyId).eq("wallet", s.wallet).maybeSingle();
  if (existing) await admin.from("post_reply_likes").delete().eq("reply_id", replyId).eq("wallet", s.wallet);
  else {
    const { error } = await admin.from("post_reply_likes").insert({ reply_id: replyId, wallet: s.wallet });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await notify([{ wallet: reply.author, kind: "reply_like", actor: s.wallet, postId: id }]);
  }
  const { count } = await admin.from("post_reply_likes").select("reply_id", { count: "exact", head: true }).eq("reply_id", replyId);
  await admin.from("post_replies").update({ like_count: count ?? 0 }).eq("id", replyId);
  return NextResponse.json({ liked: !existing, like_count: count ?? 0 });
}
