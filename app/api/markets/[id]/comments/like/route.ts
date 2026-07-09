import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/markets/[id]/comments/like
 * Body: { comment_id: string }
 * Toggles like on a comment. Returns { liked: boolean, like_count: number }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: marketId } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Auth check
  const { data: walletAddress } = await supabase.rpc("get_wallet_address");
  if (!walletAddress) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json() as { comment_id?: string };
  const commentId = body.comment_id;
  if (!commentId) {
    return NextResponse.json({ error: "comment_id required" }, { status: 400 });
  }

  // Verify comment belongs to this market
  const commentRes = await db
    .from("market_comments")
    .select("id, market_id")
    .eq("id", commentId)
    .maybeSingle();
  const comment = commentRes.data as { id: string; market_id: string } | null;

  if (!comment || comment.market_id !== marketId) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  // Check if already liked
  const existingRes = await db
    .from("market_comment_likes")
    .select("id")
    .eq("comment_id", commentId)
    .eq("wallet_address", walletAddress)
    .maybeSingle();
  const existing = existingRes.data as { id: string } | null;

  let liked: boolean;

  if (existing) {
    // Unlike
    await db
      .from("market_comment_likes")
      .delete()
      .eq("id", existing.id);
    liked = false;
  } else {
    // Like
    await db
      .from("market_comment_likes")
      .insert({ comment_id: commentId, wallet_address: walletAddress });
    liked = true;
  }

  // Return updated like count
  const { count } = await db
    .from("market_comment_likes")
    .select("*", { count: "exact", head: true })
    .eq("comment_id", commentId);

  return NextResponse.json({ liked, like_count: count ?? 0 });
}
