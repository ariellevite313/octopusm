import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { MarketCommentEnriched } from "@/lib/supabase/types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: marketId } = await params;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(marketId))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

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
  // Fetch OCTO balances directly from octo_transactions (source of truth)
  const uniqueWallets = [...new Set(comments.map((c) => c.wallet_address as string))];
  const octoMap: Record<string, number> = {};
  if (uniqueWallets.length > 0) {
    const { data: octoRows } = await admin
      .from("octo_transactions")
      .select("wallet_address, amount")
      .in("wallet_address", uniqueWallets);
    for (const row of (octoRows ?? []) as { wallet_address: string; amount: number }[]) {
      octoMap[row.wallet_address] = (octoMap[row.wallet_address] ?? 0) + (row.amount ?? 0);
    }
  }

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
      octo_balance:   octoMap[c.wallet_address as string] ?? 0,
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

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(marketId))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // BUG-16 fix: verify session server-side — wallet_address from body alone is not trustworthy
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const sessionWallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!sessionWallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { content?: string; parent_id?: string; wallet_address?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const wallet = sessionWallet; // always use session wallet, ignore body.wallet_address

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

  // Fetch octo_balance directly from octo_transactions (source of truth)
  const { data: octoRows } = await admin
    .from("octo_transactions")
    .select("amount")
    .eq("wallet_address", wallet);
  const octo_balance: number = ((octoRows ?? []) as { amount: number }[]).reduce(
    (sum, r) => sum + (r.amount ?? 0), 0
  );

  return NextResponse.json({ ...data, octo_balance, like_count: 0, liked_by_me: false, replies: [] }, { status: 201 });
}
