import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: RouteParams) {
  const { id: tokenId } = await params;
  if (!UUID_RE.test(tokenId))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Auth via session
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { comment_id?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const commentId = body.comment_id;
  if (!commentId || !UUID_RE.test(commentId))
    return NextResponse.json({ error: "comment_id required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Vérifier que le commentaire appartient à ce token
  const { data: comment } = await admin
    .from("launchpad_comments")
    .select("id, token_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment || comment.token_id !== tokenId)
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  // Toggle like
  const { data: existing } = await admin
    .from("launchpad_comment_likes")
    .select("comment_id")
    .eq("comment_id", commentId)
    .eq("wallet_address", wallet)
    .maybeSingle();

  let liked: boolean;
  if (existing) {
    await admin.from("launchpad_comment_likes").delete()
      .eq("comment_id", commentId).eq("wallet_address", wallet);
    liked = false;
  } else {
    await admin.from("launchpad_comment_likes")
      .insert({ comment_id: commentId, wallet_address: wallet });
    liked = true;
  }

  const { count } = await admin
    .from("launchpad_comment_likes")
    .select("*", { count: "exact", head: true })
    .eq("comment_id", commentId);

  return NextResponse.json({ liked, like_count: count ?? 0 });
}
