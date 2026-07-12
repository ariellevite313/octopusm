import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from("mutuel_markets")
    .select("id, slug, title, description, cover_image_src, options, category, status, bet_token, creation_fee_token, creation_fee_amount, creator_wallet, betting_closes_at, total_pool_usdc, total_pool_clt, bet_count, winning_option_id, admin_notes, created_at")
    .eq("id", id)
    .in("status", ["active", "closed", "resolved", "cancelled"])
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
