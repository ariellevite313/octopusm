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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Validated bets from mutuel_bets
  const { data: bets } = await admin
    .from("mutuel_bets")
    .select("id, market_id, option_id, amount, token, payout_amount, paid_at, created_at, mutuel_markets(id, title, slug, status, options, bet_token, winning_option_id, admin_notes)")
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: false })
    .limit(100);

  // 2. Pending payments (not yet validated by admin)
  const { data: pending } = await admin
    .from("payments")
    .select("id, market_id, selection_id, selection_label, amount_usdc, token, created_at")
    .eq("user_wallet", wallet)
    .eq("flow", "pool_prediction")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    bets:    bets    ?? [],
    pending: pending ?? [],
  });
}
