import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: marketId } = await params;

  if (!marketId || marketId.length < 3)
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let body: { content?: string; parent_id?: string; wallet_address?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const content       = (body.content ?? "").trim();
  const parent_id     = body.parent_id ?? null;
  const walletAddress = body.wallet_address ?? null;

  if (!walletAddress)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!content || content.length < 1 || content.length > 1000)
    return NextResponse.json({ error: "Content must be 1-1000 characters" }, { status: 400 });

  const admin = createAdminClient() as any;

  // If replying, verify the parent comment belongs to this market
  if (parent_id) {
    if (!UUID_RE.test(parent_id))
      return NextResponse.json({ error: "Invalid parent_id" }, { status: 400 });

    const parentRes = await admin
      .from("market_comments")
      .select("id, market_id, parent_id")
      .eq("id", parent_id)
      .maybeSingle();
    const parent = parentRes.data as { id: string; market_id: string; parent_id: string | null } | null;

    if (!parent || parent.market_id !== marketId)
      return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
    if (parent.parent_id)
      return NextResponse.json({ error: "Cannot reply to a reply" }, { status: 400 });
  }

  // Fetch username + avatar for denormalization
  const walletRes = await admin
    .from("wallets")
    .select("username, avatar_src")
    .eq("address", walletAddress)
    .maybeSingle();
  const wallet = walletRes.data as { username: string | null; avatar_src: string | null } | null;

  const insertRes = await admin
    .from("market_comments")
    .insert({
      market_id:      marketId,
      parent_id:      parent_id,
      wallet_address: walletAddress,
      username:       wallet?.username ?? null,
      avatar_src:     wallet?.avatar_src ?? null,
      content,
    })
    .select()
    .single();

  if (insertRes.error) {
    console.error("[comments] insert:", insertRes.error.message);
    return NextResponse.json({ error: insertRes.error.message }, { status: 500 });
  }

  // Fetch octo_balance directly from octo_transactions (source of truth)
  const { data: octoRows } = await admin
    .from("octo_transactions")
    .select("amount")
    .eq("wallet_address", walletAddress);
  const octo_balance: number = ((octoRows ?? []) as { amount: number }[]).reduce(
    (sum, r) => sum + (r.amount ?? 0), 0
  );

  return NextResponse.json({ ...insertRes.data, octo_balance, like_count: 0, liked_by_me: false, replies: [] }, { status: 201 });
}
