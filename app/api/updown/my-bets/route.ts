import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/updown/my-bets?wallet=Y
 * Retourne tous les paris updown du wallet (pour le dashboard).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) return NextResponse.json({ bets: [] });

  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("updown_bets")
    .select(`
      id, market_id, direction, amount, status, payout, created_at,
      updown_markets (symbol, duration_min, strike_price, status, outcome)
    `)
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ bets: [] });
  return NextResponse.json({ bets: data ?? [] });
}
