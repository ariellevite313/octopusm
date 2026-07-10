import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/pools/predict
 * Called by pool-betting.ts after on-chain transfer succeeds.
 * Inserts a pending payment row using the admin client (bypasses RLS).
 * wallet_address comes from the request body (signed by the user on-chain).
 */
export async function POST(req: Request) {
  const body = await req.json() as {
    payment_request_id: string;
    payment_reference:  string;
    title:              string;
    subtitle:           string;
    market_id:          string;
    selection_id:       string;
    selection_label:    string;
    amount_usdc:        number;
    token:              string;
    tx_signature:       string;
    wallet_address:     string;
  };

  if (!body.market_id || !body.selection_id || !body.amount_usdc || !body.tx_signature || !body.wallet_address) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient() as any;

  const { error } = await admin.from("payments").insert({
    id:                 crypto.randomUUID(),
    payment_request_id: body.payment_request_id,
    payment_reference:  body.payment_reference,
    flow:               "pool_prediction",
    title:              body.title,
    subtitle:           body.subtitle,
    category_label:     "pool",
    market_id:          body.market_id,
    selection_id:       body.selection_id,
    selection_label:    body.selection_label,
    user_wallet:        body.wallet_address,
    recipient_wallet:   "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ",
    amount_usdc:        body.amount_usdc,
    reserve_fee_usdc:   0,
    total_paid_usdc:    body.amount_usdc,
    token:              body.token,
    status:             "pending",
    tx_signature:       body.tx_signature,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Transaction already submitted" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
