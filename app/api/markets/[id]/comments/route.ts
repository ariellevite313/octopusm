import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: marketId } = await params;
  const supabase = await createClient();

  // Auth check
  const { data: walletData } = await supabase.rpc("get_wallet_address");
  if (!walletData) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json() as { content?: string; parent_id?: string };
  const content = (body.content ?? "").trim();
  const parent_id = body.parent_id ?? null;

  if (!content || content.length < 1 || content.length > 1000) {
    return NextResponse.json({ error: "Content must be 1–1000 characters" }, { status: 400 });
  }

  // If replying, verify the parent comment belongs to this market
  if (parent_id) {
    const { data: parent } = await supabase
      .from("market_comments")
      .select("id, market_id, parent_id")
      .eq("id", parent_id)
      .maybeSingle();

    if (!parent || parent.market_id !== marketId) {
      return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
    }
    // Only 1 level of nesting: if parent is already a reply, reject
    if (parent.parent_id) {
      return NextResponse.json({ error: "Cannot reply to a reply" }, { status: 400 });
    }
  }

  // Fetch username + avatar for denormalization
  const { data: wallet } = await supabase
    .from("wallets")
    .select("username, avatar_src")
    .eq("address", walletData)
    .maybeSingle();

  const { data, error } = await supabase
    .from("market_comments")
    .insert({
      market_id:      marketId,
      parent_id:      parent_id,
      wallet_address: walletData,
      username:       wallet?.username ?? null,
      avatar_src:     wallet?.avatar_src ?? null,
      content,
    })
    .select()
    .single();

  if (error) {
    console.error("[comments] insert:", error.message);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
