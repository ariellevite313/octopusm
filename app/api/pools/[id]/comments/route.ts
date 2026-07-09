import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { MarketCommentEnriched } from "@/lib/supabase/types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: marketId } = await params;
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet") ?? null;

  const admin = createAdminClient() as any;

  const { data: rows, error } = await admin
    .from("mutuel_market_comments")
    .select("*")
    .eq("market_id", marketId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const comments = (rows ?? []) as Array<Record<string, unknown>>;

  // Fetch likes for current wallet
  let likedSet = new Set<string>();
  if (wallet) {
    const { data: likes } = await admin
      .from("mutuel_market_comment_likes")
      .select("comment_id")
      .eq("wallet_address", wallet);
    likedSet = new Set((likes ?? []).map((l: { comment_id: string }) => l.comment_id));
  }

  // Build threaded structure (top-level + replies)
  const topLevel: MarketCommentEnriched[] = [];
  const byId: Record<string, MarketCommentEnriched> = {};

  for (const c of comments) {
    const enriched: MarketCommentEnriched = {
      id:             c.id as string,
      market_id:      c.market_id as string,
      wallet_address: c.wallet_address as string,
      username:       c.username as string | null,
      avatar_src:     c.avatar_src as string | null,
      content:        c.content as string,
      parent_id:      c.parent_id as string | null,
      like_count:     c.like_count as number,
      created_at:     c.created_at as string,
      liked_by_me:    likedSet.has(c.id as string),
      replies:        [],
    };
    byId[enriched.id] = enriched;
    if (!c.parent_id) topLevel.push(enriched);
  }

  for (const c of comments) {
    if (c.parent_id && byId[c.parent_id as string] && byId[c.id as string]) {
      byId[c.parent_id as string].replies.push(byId[c.id as string]);
    }
  }

  return NextResponse.json(topLevel);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: marketId } = await params;

  // Auth via session client
  const userClient = await createClient() as any;
  const { data: { user } } = await userClient.auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json() as { content?: string; parent_id?: string };
  const content = (body.content ?? "").trim();
  const parent_id = body.parent_id ?? null;

  if (!content || content.length < 1 || content.length > 1000)
    return NextResponse.json({ error: "Content must be 1–1000 characters" }, { status: 400 });

  const admin = createAdminClient() as any;

  // Verify market exists
  const { data: market } = await admin
    .from("mutuel_markets")
    .select("id")
    .eq("id", marketId)
    .maybeSingle();
  if (!market) return NextResponse.json({ error: "Pool not found" }, { status: 404 });

  // If replying, verify parent
  if (parent_id) {
    const { data: parent } = await admin
      .from("mutuel_market_comments")
      .select("id, market_id, parent_id")
      .eq("id", parent_id)
      .maybeSingle();
    if (!parent || parent.market_id !== marketId)
      return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
    if (parent.parent_id)
      return NextResponse.json({ error: "Cannot reply to a reply" }, { status: 400 });
  }

  // Fetch username/avatar
  const { data: walletRow } = await admin
    .from("wallets")
    .select("username, avatar_src")
    .eq("address", wallet)
    .maybeSingle();

  const { data, error } = await admin
    .from("mutuel_market_comments")
    .insert({
      market_id:      marketId,
      parent_id,
      wallet_address: wallet,
      username:       walletRow?.username ?? null,
      avatar_src:     walletRow?.avatar_src ?? null,
      content,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
