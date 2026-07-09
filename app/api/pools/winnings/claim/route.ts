import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/pools/winnings/claim
 * body: { betId: string }
 *
 * Called by the winner to confirm they received their payout.
 * This does NOT send tokens — admin sends manually.
 * This just marks paid_at = now() so the bet moves to "claimed" state.
 *
 * The 5% fee on refunds is informational only (displayed in UI).
 * Admin is expected to send net_payout = payout_amount * 0.95 for refunds.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json() as { betId?: string };
  const { betId } = body;
  if (!betId || typeof betId !== "string")
    return NextResponse.json({ error: "betId required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Verify the bet belongs to this wallet and has a payout
  const { data: bet, error: bErr } = await admin
    .from("mutuel_bets")
    .select("id, wallet_address, payout_amount, paid_at")
    .eq("id", betId)
    .single();

  if (bErr || !bet)
    return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  if (bet.wallet_address !== wallet)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (bet.payout_amount === null)
    return NextResponse.json({ error: "No payout set for this bet" }, { status: 400 });
  if (bet.paid_at !== null)
    return NextResponse.json({ error: "Already claimed" }, { status: 400 });

  const { error } = await admin
    .from("mutuel_bets")
    .update({ paid_at: new Date().toISOString() })
    .eq("id", betId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
