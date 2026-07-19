import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/pools/my-bets
 * Returns all pool activity for the authenticated wallet:
 *   - mutuel_bets (validated bets)
 *   - payments pending (bets awaiting admin validation)
 * Each entry includes market info (title, slug, status, options, bet_token).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient() as any;

  // 1. Validated bets from mutuel_bets
  const { data: bets } = await admin
    .from("mutuel_bets")
    .select("id, market_id, option_id, amount, token, payout_amount, claimed_at, paid_at, created_at, mutuel_markets(id, title, slug, status, is_refund, options, bet_token, winning_option_id, admin_notes)")
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: false })
    .limit(100);

  // 2. Pending pool payments (not yet validated by admin)
  const { data: pending } = await admin
    .from("payments")
    .select("id, market_id, selection_id, selection_label, amount_usdc, token, created_at")
    .eq("user_wallet", wallet)
    .eq("flow", "pool_prediction")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  // 3. Pending prediction market payments (not yet validated by admin)
  const { data: pendingPredictions } = await admin
    .from("payments")
    .select("id, market_id, selection_id, selection_label, amount_usdc, token, title, created_at")
    .eq("user_wallet", wallet)
    .eq("flow", "prediction")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  // BUG-07 fix: calculate net_payout once here so the frontend never recalculates it.
  // BUG-23 fix: use market.is_refund (set by DB) instead of parsing admin_notes strings.
  // Refunds (cancelled market OR all-on-winner resolution) take a 5% fee.
  const enrichedBets = (bets ?? []).map((bet: Record<string, unknown>) => {
    const market = bet.mutuel_markets as Record<string, unknown> | null;
    const isRefund = !!(market?.is_refund);
    const payout = bet.payout_amount != null ? Number(bet.payout_amount) : null;
    const net_payout = payout != null
      ? isRefund
        ? Math.floor(payout * 0.95 * 1_000_000) / 1_000_000
        : payout
      : null;
    return { ...bet, is_refund: isRefund, net_payout };
  });

  return NextResponse.json({
    bets:               enrichedBets,
    pending:            pending            ?? [],
    pendingPredictions: pendingPredictions ?? [],
  });
}
