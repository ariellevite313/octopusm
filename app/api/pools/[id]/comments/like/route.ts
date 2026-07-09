import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: marketId } = await params;

  const userClient = await createClient() as any;
  const { data: { user } } = await userClient.auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json() as { comment_id?: string };
  const commentId = body.comment_id;
  if (!commentId) return NextResponse.json({ error: "comment_id required" }, { status: 400 });

  const admin = createAdminClient() as any;

  // Verify comment belongs to this market
  const { data: comment } = await admin
    .from("mutuel_market_comments")
    .select("id, market_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment || comment.market_id !== marketId)
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  // Toggle like
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
    await admin.from("mutuel_market_comments")
      .update({ like_count: Math.max(0, ((comment as { like_count?: number }).like_count ?? 0) - 1) })
      .eq("id", commentId).catch(() => null);
  } else {
    await admin
      .from("mutuel_market_comment_likes")
      .insert({ comment_id: commentId, wallet_address: wallet });
    liked = true;
    await admin.from("mutuel_market_comments")
      .update({ like_count: ((comment as { like_count?: number }).like_count ?? 0) + 1 })
      .eq("id", commentId).catch(() => null);
  }

  const { count } = await admin
    .from("mutuel_market_comment_likes")
    .select("*", { count: "exact", head: true })
    .eq("comment_id", commentId);

  return NextResponse.json({ liked, like_count: count ?? 0 });
}
