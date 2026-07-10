import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/pools/[id]/comments/like
 * Body: { comment_id: string; wallet_address: string }
 * Toggles like on a mutuel_market_comment.
 * wallet_address comes from the client (proven by on-chain identity).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: marketId } = await params;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(marketId))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json() as { comment_id?: string; wallet_address?: string };
  const commentId    = body.comment_id;
  const wallet       = body.wallet_address ?? null;

  if (!commentId) return NextResponse.json({ error: "comment_id required" }, { status: 400 });
  if (!wallet)    return NextResponse.json({ error: "wallet_address required" }, { status: 400 });

  const admin = createAdminClient() as any;

  // Verify comment belongs to this market
  const { data: comment } = await admin
    .from("mutuel_market_comments")
    .select("id, market_id")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment || comment.market_id !== marketId)
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  // Check if already liked
  const { data: existing } = await admin
    .from("mutuel_market_comment_likes")
    .select("comment_id, wallet_address")
    .eq("comment_id", commentId)
    .eq("wallet_address", wallet)
    .maybeSingle();

  let liked: boolean;

  if (existing) {
    await admin
      .from("mutuel_market_comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("wallet_address", wallet);
    liked = false;
  } else {
    await admin
      .from("mutuel_market_comment_likes")
      .insert({ comment_id: commentId, wallet_address: wallet });
    liked = true;
  }

  const { count } = await admin
    .from("mutuel_market_comment_likes")
    .select("*", { count: "exact", head: true })
    .eq("comment_id", commentId);

  const newCount = count ?? 0;

  // Sync denormalized like_count on the comment row
  await admin
    .from("mutuel_market_comments")
    .update({ like_count: newCount })
    .eq("id", commentId);

  return NextResponse.json({ liked, like_count: newCount });
}
