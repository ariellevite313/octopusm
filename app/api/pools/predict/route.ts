import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { awardOcto, octoForBet } from "@/lib/octo";
import { awardReferralCommission } from "@/lib/referral";

/**
 * POST /api/pools/predict
 * Called by pool-betting.ts after on-chain transfer succeeds.
 * Inserts a pending payment row using the admin client (bypasses RLS).
 * wallet_address is verified against the authenticated session.
 */
export async function POST(req: Request) {
  // BUG-03 fix: verify authenticated session before accepting any body data
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
    market_id:          string;
    selection_id:       string;
    selection_label:    string;
    amount_usdc:        number;
    token:              string;
    tx_signature:       string;
    wallet_address:     string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!body.market_id || !body.selection_id || !body.amount_usdc || !body.tx_signature || !body.wallet_address) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // BUG-03 fix: wallet in body must match authenticated session
  if (body.wallet_address !== sessionWallet) {
    return NextResponse.json({ error: "Wallet mismatch" }, { status: 403 });
  }

  const minAmt = body.token === "usdc" ? 2 : 500_000;
  if (body.amount_usdc < minAmt) {
    return NextResponse.json({ error: "Amount below minimum stake" }, { status: 400 });
  }

  const admin = createAdminClient() as any;

  // BUG-11 fix: validate market exists, is active, and betting window is open
  const { data: market, error: mErr } = await admin
    .from("mutuel_markets")
    .select("id, status, betting_closes_at, options")
    .eq("id", body.market_id)
    .maybeSingle();

  if (mErr || !market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }
  if (market.status !== "active") {
    return NextResponse.json({ error: "Market is not accepting bets" }, { status: 400 });
  }
  if (market.betting_closes_at && new Date(market.betting_closes_at) < new Date()) {
    return NextResponse.json({ error: "Betting window has closed" }, { status: 400 });
  }
  const options = typeof market.options === "string" ? JSON.parse(market.options) : market.options;
  const validOption = (options ?? []).some((o: { id: string }) => o.id === body.selection_id);
  if (!validOption) {
    return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
  }

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

  // Award OCTO + referral commission for placing a pool bet (fire and forget)
  awardOcto(body.wallet_address, octoForBet(body.amount_usdc, body.token), "bet", "Pool bet placed").catch(() => {});
  awardReferralCommission(body.wallet_address, body.amount_usdc, body.token).catch(() => {});

  return NextResponse.json({ ok: true });
}
