import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { MarketCommentEnriched } from "@/lib/supabase/types";

type RouteParams = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── GET /api/launchpad/[id]/comments ─────────────────────────────────────────
export async function GET(req: Request, { params }: RouteParams) {
  const { id: tokenId } = await params;
  if (!UUID_RE.test(tokenId))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const wallet = new URL(req.url).searchParams.get("wallet") ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: rows, error } = await admin
    .from("launchpad_comments")
    .select("*")
    .eq("token_id", tokenId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const comments = (rows ?? []) as Array<Record<string, unknown>>;

  // Likes du wallet courant
  let likedSet = new Set<string>();
  if (wallet) {
    const { data: likes } = await admin
      .from("launchpad_comment_likes")
      .select("comment_id")
      .eq("wallet_address", wallet);
    likedSet = new Set((likes ?? []).map((l: { comment_id: string }) => l.comment_id));
  }

  // OCTO balances
  const uniqueWallets = [...new Set(comments.map(c => c.wallet_address as string))];
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

  // Like counts
  const likeCountMap: Record<string, number> = {};
  if (comments.length > 0) {
    const { data: likeCounts } = await admin
      .from("launchpad_comment_likes")
      .select("comment_id")
      .in("comment_id", comments.map(c => c.id));
    for (const row of (likeCounts ?? []) as { comment_id: string }[]) {
      likeCountMap[row.comment_id] = (likeCountMap[row.comment_id] ?? 0) + 1;
    }
  }

  // Structurer en arbre (top-level + replies)
  const byId: Record<string, MarketCommentEnriched> = {};
  const topLevel: MarketCommentEnriched[] = [];

  for (const c of comments) {
    const enriched: MarketCommentEnriched = {
      id:             c.id as string,
      market_id:      c.token_id as string,
      wallet_address: c.wallet_address as string,
      username:       c.username as string | null,
      avatar_src:     c.avatar_src as string | null,
      content:        c.content as string,
      created_at:     c.created_at as string,
      parent_id:      c.parent_id as string | null,
      like_count:     likeCountMap[c.id as string] ?? 0,
      liked_by_me:    likedSet.has(c.id as string),
      octo_balance:   octoMap[c.wallet_address as string] ?? 0,
      replies:        [],
    };
    byId[enriched.id] = enriched;
  }

  for (const enriched of Object.values(byId)) {
    if (enriched.parent_id && byId[enriched.parent_id]) {
      byId[enriched.parent_id].replies.push(enriched);
    } else if (!enriched.parent_id) {
      topLevel.push(enriched);
    }
  }

  return NextResponse.json(topLevel);
}

// ── POST /api/launchpad/[id]/comments ────────────────────────────────────────
export async function POST(req: Request, { params }: RouteParams) {
  const { id: tokenId } = await params;
  if (!UUID_RE.test(tokenId))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: { content?: string; parent_id?: string; wallet_address?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const content       = (body.content ?? "").trim();
  const parent_id     = body.parent_id ?? null;
  const walletAddress = body.wallet_address ?? null;

  if (!walletAddress)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!content || content.length > 1000)
    return NextResponse.json({ error: "Content must be 1-1000 characters" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Vérifier que le token existe
  const { data: token } = await admin
    .from("launchpad_tokens")
    .select("id")
    .eq("id", tokenId)
    .maybeSingle();
  if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  // Vérifier le parent si c'est une réponse
  if (parent_id) {
    if (!UUID_RE.test(parent_id))
      return NextResponse.json({ error: "Invalid parent_id" }, { status: 400 });
    const { data: parent } = await admin
      .from("launchpad_comments")
      .select("id, token_id, parent_id")
      .eq("id", parent_id)
      .maybeSingle();
    if (!parent || parent.token_id !== tokenId)
      return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
    if (parent.parent_id)
      return NextResponse.json({ error: "Cannot reply to a reply" }, { status: 400 });
  }

  // Username + avatar
  const { data: wallet } = await admin
    .from("wallets")
    .select("username, avatar_src")
    .eq("address", walletAddress)
    .maybeSingle();

  const { data: inserted, error } = await admin
    .from("launchpad_comments")
    .insert({
      token_id:       tokenId,
      parent_id,
      wallet_address: walletAddress,
      username:       wallet?.username ?? null,
      avatar_src:     wallet?.avatar_src ?? null,
      content,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // OCTO balance
  const { data: octoRows } = await admin
    .from("octo_transactions")
    .select("amount")
    .eq("wallet_address", walletAddress);
  const octo_balance: number = ((octoRows ?? []) as { amount: number }[])
    .reduce((s, r) => s + (r.amount ?? 0), 0);

  return NextResponse.json(
    { ...inserted, octo_balance, like_count: 0, liked_by_me: false, replies: [] },
    { status: 201 }
  );
}
