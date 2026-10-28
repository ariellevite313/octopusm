import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { createPoolMarket } from "@/lib/market/create-pool";

export const revalidate = 0;

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("mutuel_markets")
    .select("id, slug, title, description, cover_image_src, options, category, status, bet_token, creation_fee_token, creation_fee_amount, creator_wallet, betting_closes_at, match_key, total_pool_usdc, total_pool_clt, bet_count, winning_option_id, created_at")
    .in("status", ["pending", "active", "closed"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const userClient = await createClient() as any;
  const { data: { user } } = await userClient.auth.getUser();
  const wallet: string | null = user?.app_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  return createPoolMarket(wallet, body);
}
