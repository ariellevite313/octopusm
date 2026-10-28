import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireSessionWallet } from "@/lib/social/session";
import { rateHit } from "@/lib/rate-limit";

/**
 * POST /api/markets/[id]/comments/like
 * Body: { comment_id: string } — le wallet vient de la session
 * Toggles like on a market comment. Returns { liked: boolean, like_count: number }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: marketId } = await params;

  const s = await requireSessionWallet();
  if ("error" in s) return s.error;
  if (!(await rateHit(`cmt-like:${s.wallet}`, 30, 60_000))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { comment_id?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const commentId = body.comment_id;
  const wallet    = s.wallet;

  if (!commentId) return NextResponse.json({ error: "comment_id required" }, { status: 400 });

  const admin = createAdminClient() as any;

  // Verify comment belongs to this market
  const { data: comment } = await admin
    .from("market_comments")
    .select("id, market_id")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment || comment.market_id !== marketId)
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  // Check if already liked
  const { data: existing } = await admin
    .from("market_comment_likes")
    .select("id")
    .eq("comment_id", commentId)
    .eq("wallet_address", wallet)
    .maybeSingle();

  let liked: boolean;

  if (existing) {
    await admin.from("market_comment_likes").delete().eq("id", existing.id);
    liked = false;
  } else {
    await admin.from("market_comment_likes").insert({ comment_id: commentId, wallet_address: wallet });
    liked = true;
  }

  const { count } = await admin
    .from("market_comment_likes")
    .select("*", { count: "exact", head: true })
    .eq("comment_id", commentId);

  const newCount = count ?? 0;

  // Sync denormalized like_count
  await admin
    .from("market_comments")
    .update({ like_count: newCount })
    .eq("id", commentId);

  return NextResponse.json({ liked, like_count: newCount });
}
