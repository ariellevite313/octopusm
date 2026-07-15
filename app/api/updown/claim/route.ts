import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/updown/claim
 * User claims their winnings. Marks bet as "claimed".
 * Admin will then manually transfer and mark as "paid".
 */
export async function POST(req: Request) {
  const body = await req.json() as {
    bet_id: string;
    wallet_address: string;
  };

  const { bet_id, wallet_address } = body;

  if (!bet_id || !wallet_address) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient() as any;

  const { data: bet, error: betErr } = await admin
    .from("updown_bets")
    .select("id, status, payout, wallet_address, market_id")
    .eq("id", bet_id)
    .single();

  if (betErr || !bet) {
    return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  }
  if (bet.wallet_address !== wallet_address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (bet.status !== "won") {
    return NextResponse.json({ error: `Cannot claim bet with status: ${bet.status}` }, { status: 409 });
  }

  const { data: updated, error: updateErr } = await admin
    .from("updown_bets")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .eq("id", bet_id)
    .select("id, status, claimed_at")
    .single();

  if (updateErr) {
    console.error("[updown/claim] update error:", updateErr);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  console.log("[updown/claim] claimed:", updated);
  return NextResponse.json({ ok: true, payout: bet.payout });
}
