import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { FEE_RATE, RESERVE_FEE_RATE, computeReward } from "@/lib/market/betting";

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { paymentId, action } = await req.json() as { paymentId: string; action: string };

  if (!paymentId || !["approve", "reject"].includes(action))
    return NextResponse.json({ error: "paymentId and action required" }, { status: 400 });

  const admin = createAdminClient() as any;

  // Fetch payment
  const { data: payment, error: fetchErr } = await admin
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .eq("status", "pending")
    .single();

  if (fetchErr || !payment)
    return NextResponse.json({ error: "Payment not found or already processed" }, { status: 404 });

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminWallet = user?.user_metadata?.wallet_address ?? null;

  // ── REJECT ─────────────────────────────────────────────────────────────────
  if (action === "reject") {
    const { error } = await admin
      .from("payments")
      .update({ status: "rejected", reviewed_at: now, reviewed_by_wallet: adminWallet })
      .eq("id", paymentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── APPROVE ────────────────────────────────────────────────────────────────

  // Dedup: reject if tx_signature already approved
  if (payment.tx_signature) {
    const { count } = await admin
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("tx_signature", payment.tx_signature)
      .eq("status", "approved");
    if ((count ?? 0) > 0)
      return NextResponse.json({ error: "This transaction has already been approved" }, { status: 409 });
  }

  // Mark payment approved
  const { error: payErr } = await admin
    .from("payments")
    .update({ status: "approved", reviewed_at: now, reviewed_by_wallet: adminWallet })
    .eq("id", paymentId);
  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });

  // ── Prediction market: create prediction_history row ──────────────────────
  if (payment.flow === "prediction" && payment.market_id && payment.selection_id) {
    const amount = Number(payment.amount_usdc) || 0;

    const { data: market } = await admin
      .from("prediction_markets")
      .select("options")
      .eq("id", payment.market_id)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any[] = market?.options ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const option = options.find((o: any) => o.id === payment.selection_id);
    const multiplier = option?.multiplier ?? 2;
    const { reserveFee, totalCharged, grossReward, netReward } = computeReward(amount, multiplier);

    const { data: existing } = await admin
      .from("prediction_history")
      .select("id")
      .eq("payment_reference", payment.payment_reference)
      .maybeSingle();

    if (!existing) {
      const { error: histErr } = await admin.from("prediction_history").insert({
        id:                 crypto.randomUUID(),
        market_id:          payment.market_id,
        market_title:       payment.title ?? "",
        category_label:     payment.category_label ?? "",
        selection_id:       payment.selection_id,
        selection_label:    payment.selection_label ?? payment.subtitle ?? "",
        amount,
        reserve_fee:        reserveFee,
        total_charged:      totalCharged,
        claim_fee_rate:     FEE_RATE,
        payout_multiple:    multiplier,
        gross_reward:       grossReward,
        net_reward:         netReward,
        wallet_address:     payment.user_wallet,
        payment_reference:  payment.payment_reference,
        payment_request_id: payment.payment_request_id,
        token:              payment.token ?? "usdc",
        reported_at:        payment.created_at ?? now,
        admin_decision_status: "approved",
      });
      if (histErr) console.error("[bets] prediction_history insert:", histErr.message);
    }
    return NextResponse.json({ ok: true });
  }

  // ── Pool prediction: create mutuel_bet (approved directly) ────────────────
  if (payment.flow === "pool_prediction" && payment.market_id && payment.selection_id) {
    const { data: market, error: mErr } = await admin
      .from("mutuel_markets")
      .select("id, status, options, bet_token, total_pool_usdc, total_pool_clt, bet_count")
      .eq("id", payment.market_id)
      .single();

    if (mErr || !market)
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    if (market.status !== "active")
      return NextResponse.json({ error: "Market is not active" }, { status: 400 });

    const options = typeof market.options === "string" ? JSON.parse(market.options) : market.options;
    const validOption = options.some((o: { id: string }) => o.id === payment.selection_id);
    if (!validOption)
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });

    const token: string = market.bet_token;
    const amount = Number(payment.amount_usdc);

    const { data: existingBet } = await admin
      .from("mutuel_bets")
      .select("id")
      .eq("tx_signature", payment.tx_signature)
      .eq("status", "approved")
      .maybeSingle();

    if (!existingBet) {
      const { error: betErr } = await admin.from("mutuel_bets").insert({
        market_id:      payment.market_id,
        wallet_address: payment.user_wallet,
        option_id:      payment.selection_id,
        amount,
        token,
        tx_signature:   payment.tx_signature ?? null,
        status:         "approved",
      });
      if (betErr) return NextResponse.json({ error: betErr.message }, { status: 500 });

      const { error: rpcErr } = await admin.rpc("increment_pool_total", {
        p_market_id: payment.market_id,
        p_token:     token.toLowerCase(),
        p_amount:    amount,
      });
      if (rpcErr) console.error("[bets] increment_pool_total:", rpcErr.message);
    }

    return NextResponse.json({ ok: true });
  }

  // Suppress unused import warning
  void RESERVE_FEE_RATE;

  return NextResponse.json({ ok: true });
}
