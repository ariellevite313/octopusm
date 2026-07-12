import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await (supabase as any)
    .from("mutuel_markets")
    .select("id, slug, title, description, cover_image_src, options, category, status, bet_token, creation_fee_token, creation_fee_amount, creator_wallet, betting_closes_at, total_pool_usdc, total_pool_clt, bet_count, winning_option_id, admin_notes, created_at")
    .eq("creator_wallet", wallet)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
