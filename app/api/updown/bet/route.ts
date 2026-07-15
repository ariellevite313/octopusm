import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/updown/bet
 * Called after on-chain USDC transfer succeeds.
 * Inserts bet + atomically increments pool_up or pool_down.
 */
export async function POST(req: Request) {
  const body = await req.json() as {
    market_id:     string;
    wallet_address: string;
    direction:     "up" | "down";
    amount:        number;
    tx_signature:  string;
  };

  const { market_id, wallet_address, direction, amount, tx_signature } = body;

  if (!market_id || !wallet_address || !direction || !amount || !tx_signature) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["up", "down"].includes(direction)) {
    return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  }
  if (amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const admin = createAdminClient() as any;

  // Verify market is still open
  const { data: market, error: mErr } = await admin
    .from("updown_markets")
    .select("id, status, closes_at")
    .eq("id", market_id)
    .single();

  if (mErr || !market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }
  if (market.status !== "open") {
    return NextResponse.json({ error: "Market is closed" }, { status: 409 });
  }
  if (new Date(market.closes_at) <= new Date()) {
    return NextResponse.json({ error: "Market has expired" }, { status: 409 });
  }

  // Insert bet
  const { error: betErr } = await admin.from("updown_bets").insert({
    id:             crypto.randomUUID(),
    market_id,
    wallet_address,
    direction,
    amount,
    tx_signature,
    status:         "approved",
  });

  if (betErr) {
    if (betErr.code === "23505") {
      return NextResponse.json({ error: "Transaction already submitted" }, { status: 409 });
    }
    return NextResponse.json({ error: betErr.message }, { status: 500 });
  }

  // Incrémenter le pool immédiatement pour que le volume soit visible
  const poolCol = direction === "up" ? "pool_up" : "pool_down";
  await admin.rpc("increment_updown_pool", {
    p_market_id: market_id,
    p_column:    poolCol,
    p_amount:    Number(amount),
  });

  return NextResponse.json({ ok: true });
}
