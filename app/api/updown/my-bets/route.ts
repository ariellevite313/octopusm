import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * GET /api/updown/my-bets
 * Retourne tous les paris updown du wallet (pour le dashboard).
 *
 * C-02 fix: wallet_address now comes from the authenticated session,
 * not from a query param (which could be spoofed to read any user's bets).
 */
export async function GET() {
  // C-02 fix: verify authenticated session
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
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
