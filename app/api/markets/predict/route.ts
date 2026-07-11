import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/markets/predict
 * Called by betting.ts after on-chain transfer succeeds.
 * Inserts a pending payment row using the admin client (bypasses RLS).
 * wallet_address comes from the request body (signed by the user on-chain).
 */
export async function POST(req: Request) {
  const body = await req.json() as {
    payment_request_id: string;
    payment_reference:  string;
    title:              string;
    subtitle:           string;
    category_label:     string;
    market_id:          string;
    selection_id:       string;
    selection_label:    string;
    amount_usdc:        number;
    reserve_fee_usdc:   number;
    total_paid_usdc:    number;
    token:              string;
    tx_signature?:      string;
    wallet_address:     string;
  };

  if (
    !body.market_id || !body.selection_id || !body.wallet_address ||
    !body.payment_reference || body.amount_usdc === undefined
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient() as any;

  const { error } = await admin.from("payments").insert({
    id:                 crypto.randomUUID(),
    payment_request_id: body.payment_request_id,
    payment_reference:  body.payment_reference,
    flow:               "prediction",
    title:              body.title,
    subtitle:           body.subtitle,
    category_label:     body.category_label,
    market_id:          body.market_id,
    selection_id:       body.selection_id,
    selection_label:    body.selection_label,
    user_wallet:        body.wallet_address,
    recipient_wallet:   "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ",
    amount_usdc:        body.amount_usdc,
    reserve_fee_usdc:   body.reserve_fee_usdc,
    total_paid_usdc:    body.total_paid_usdc,
    token:              body.token,
    status:             "pending",
    tx_signature:       body.tx_signature ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Transaction already submitted" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
