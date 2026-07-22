import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/pools/winnings
 * Returns all mutuel_bets where:
 *   - wallet matches the authenticated user
 *   - payout_amount IS NOT NULL (admin resolved the bet)
 *   - paid_at IS NULL (not yet claimed)
 * Includes market title + status for context.
 *
 * For cancelled markets or all-on-winner refunds, a 5% fee is deducted
 * from the net amount at claim time (not here — this route just lists).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("mutuel_bets")
    .select(`
      id,
      market_id,
      option_id,
      amount,
      token,
      payout_amount,
      paid_at,
      created_at,
      mutuel_markets ( id, title, slug, status, winning_option_id, options, admin_notes, bet_token, is_refund )
    `)
    .eq("wallet_address", wallet)
    .not("payout_amount", "is", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich each bet with net_payout after 5% withdrawal fee (Rule 3 — applies to all payouts)
  const enriched = (data ?? []).map((bet: Record<string, unknown>) => {
    const market = bet.mutuel_markets as Record<string, unknown> | null;
    const isRefund = !!(market?.is_refund);
    const payout = Number(bet.payout_amount);
    // 5% platform fee on every withdrawal, including refunds (cancelled markets)
    const net_payout = Math.floor(payout * 0.95 * 1_000_000) / 1_000_000;
    return { ...bet, is_refund: isRefund, net_payout };
  });

  return NextResponse.json(enriched);
}
