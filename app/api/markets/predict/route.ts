import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * POST /api/markets/predict
 * Called by betting.ts after on-chain transfer succeeds.
 * Inserts a pending payment row using the admin client (bypasses RLS).
 * wallet_address is verified against the authenticated session (C-01 fix).
 */
export async function POST(req: Request) {
  // C-01 fix: verify authenticated session before accepting any body data
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const sessionWallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!sessionWallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
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
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body.market_id || !body.selection_id || !body.wallet_address ||
    !body.payment_reference || body.amount_usdc === undefined
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // C-01 fix: wallet in body must match authenticated session
  if (body.wallet_address !== sessionWallet) {
    return NextResponse.json({ error: "Wallet mismatch" }, { status: 403 });
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
