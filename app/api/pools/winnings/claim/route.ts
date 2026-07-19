import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/pools/winnings/claim
 * body: { betId: string }
 * Sets claimed_at on the mutuel_bet to signal the user wants their payout.
 * The admin will then send the tokens and call mark_paid.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let _body: Record<string, unknown>;

  try { _body = await req.json(); }

  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  
  const { betId } = _body;

  if (!betId || typeof betId !== "string")
    return NextResponse.json({ error: "betId required" }, { status: 400 });

  const admin = createAdminClient() as any;

  const { data: bet, error: fetchErr } = await admin
    .from("mutuel_bets")
    .select("id, wallet_address, payout_amount, claimed_at, paid_at, market_id")
    .eq("id", betId)
    .single();

  if (fetchErr || !bet)
    return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  if (bet.wallet_address !== wallet)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (bet.payout_amount === null)
    return NextResponse.json({ error: "Bet is not yet resolved" }, { status: 400 });
  if (bet.claimed_at)
    return NextResponse.json({ error: "Already claimed" }, { status: 400 });
  if (bet.paid_at)
    return NextResponse.json({ error: "Already paid" }, { status: 400 });

  // BUG-12 fix: verify the market is actually resolved or cancelled before allowing claim
  const { data: market, error: mErr } = await admin
    .from("mutuel_markets")
    .select("status")
    .eq("id", bet.market_id)
    .single();

  if (mErr || !market)
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  if (!["resolved", "cancelled"].includes(market.status))
    return NextResponse.json({ error: "Market is not resolved yet" }, { status: 400 });

  const { error } = await admin
    .from("mutuel_bets")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", betId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
