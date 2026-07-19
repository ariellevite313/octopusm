import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * GET /api/updown/my-bet?market_id=X
 *
 * C-02 fix: wallet_address now comes from the authenticated session,
 * not from a query param (which could be spoofed to read any user's bets).
 *
 * Retourne bets[] - tous les paris du round actuel
 * + paris won sur rounds precedents non encore claims.
 */
export async function GET(req: Request) {
  // C-02 fix: verify authenticated session
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ bets: [] });

  const { searchParams } = new URL(req.url);
  const market_id = searchParams.get("market_id");

  if (!market_id) {
    return NextResponse.json({ bets: [] });
  }

  const admin = createAdminClient() as any;

  // 1. Tous les bets du round actuel
  const { data: roundBets } = await admin
    .from("updown_bets")
    .select("id, market_id, direction, amount, payout, status")
    .eq("market_id", market_id)
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: true });

  const bets: { id: string; market_id: string; direction: string; amount: number; payout: number | null; status: string }[] =
    roundBets ?? [];

  // 2. Paris won sur rounds precedents pour afficher le bouton Claim
  const { data: market } = await admin
    .from("updown_markets")
    .select("symbol, duration_min")
    .eq("id", market_id)
    .maybeSingle();

  if (market) {
    const { data: relatedMarkets } = await admin
      .from("updown_markets")
      .select("id")
      .eq("symbol", market.symbol)
      .eq("duration_min", market.duration_min)
      .eq("status", "resolved")
      .order("closes_at", { ascending: false })
      .limit(50);

    if (relatedMarkets && relatedMarkets.length > 0) {
      const marketIds = (relatedMarkets as { id: string }[]).map((m: { id: string }) => m.id);
      const { data: pendingClaims } = await admin
        .from("updown_bets")
        .select("id, market_id, direction, amount, payout, status")
        .eq("wallet_address", wallet)
        .in("market_id", marketIds)
        .in("status", ["won", "refunded"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (pendingClaims && pendingClaims.length > 0) {
        bets.push(...pendingClaims);
      }
    }
  }

  return NextResponse.json({ bets });
}
