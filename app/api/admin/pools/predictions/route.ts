import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";


// GET /api/admin/pools/predictions?marketId=xxx
// Returns pending payments for a specific pool
export async function GET(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const url = new URL(req.url);
  const marketId = url.searchParams.get("marketId");

  const admin = createAdminClient() as any;

  // BUG-10 fix: reassign query so the marketId filter is actually applied
  let query = admin
    .from("payments")
    .select("id, payment_reference, market_id, selection_id, selection_label, user_wallet, amount_usdc, token, tx_signature, created_at, title")
    .eq("flow", "pool_prediction")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (marketId) query = query.eq("market_id", marketId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/admin/pools/predictions
// body: { action: "approve"|"reject", paymentId: string }
export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  let body: { action: string; paymentId: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { action, paymentId } = body;

  if (!paymentId) return NextResponse.json({ error: "paymentId required" }, { status: 400 });

  const admin = createAdminClient() as any;

  // Fetch the payment
  const { data: payment, error: pErr } = await admin
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .eq("flow", "pool_prediction")
    .eq("status", "pending")
    .single();

  if (pErr || !payment)
    return NextResponse.json({ error: "Payment not found or already processed" }, { status: 404 });

  if (action === "reject") {
    const { error } = await admin
      .from("payments")
      .update({ status: "rejected" })
      .eq("id", paymentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "approve") {
    // BUG-02 fix: atomic optimistic lock — mark payment as "approved" only if it is still "pending".
    // This prevents two admins processing the same payment simultaneously.
    const { data: atomicLock, error: lockErr } = await admin
      .from("payments")
      .update({ status: "approved" })
      .eq("id", paymentId)
      .eq("status", "pending")
      .select("id");

    if (lockErr) return NextResponse.json({ error: lockErr.message }, { status: 500 });
    if (!atomicLock || atomicLock.length === 0) {
      return NextResponse.json({ error: "Payment already processed by another admin" }, { status: 409 });
    }

    // 0. Dedup check: reject if tx_signature already has another approved payment
    if (payment.tx_signature) {
      const { count: dupCount } = await admin
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("tx_signature", payment.tx_signature)
        .eq("status", "approved")
        .neq("id", paymentId);
      if ((dupCount ?? 0) > 0) {
        // Rollback: revert to pending since we locked it above
        await admin.from("payments").update({ status: "pending" }).eq("id", paymentId);
        return NextResponse.json({ error: "This transaction has already been approved" }, { status: 409 });
      }
    }

    // 1. Fetch market to get bet_token and validate option
    const { data: market, error: mErr } = await admin
      .from("mutuel_markets")
      .select("id, status, options, bet_token, total_pool_usdc, total_pool_clt, bet_count")
      .eq("id", payment.market_id)
      .single();

    if (mErr || !market) {
      await admin.from("payments").update({ status: "pending" }).eq("id", paymentId);
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    if (market.status !== "active") {
      await admin.from("payments").update({ status: "pending" }).eq("id", paymentId);
      return NextResponse.json({ error: "Market is not active" }, { status: 400 });
    }

    const options = typeof market.options === "string" ? JSON.parse(market.options) : market.options;
    const validOption = options.some((o: { id: string }) => o.id === payment.selection_id);
    if (!validOption) {
      await admin.from("payments").update({ status: "pending" }).eq("id", paymentId);
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }

    const token: string = market.bet_token;
    // Amount: for CLT bets amount_usdc stores the CLT amount (since we don't have a separate column)
    // We use amount_usdc as the canonical amount field regardless of token
    const amount = Number(payment.amount_usdc);

    // 2. Insert mutuel_bet with status=pending (admin must approve individually)
    const { error: betErr } = await admin
      .from("mutuel_bets")
      .insert({
        market_id:      payment.market_id,
        wallet_address: payment.user_wallet,
        option_id:      payment.selection_id,
        amount,
        token,
        tx_signature:   payment.tx_signature ?? null,
        status:         "pending",
      });

    if (betErr) {
      // Rollback payment status on bet insert failure
      await admin.from("payments").update({ status: "pending" }).eq("id", paymentId);
      return NextResponse.json({ error: betErr.message }, { status: 500 });
    }

    // Note: increment_pool_total is called only when admin approves the individual bet
    // Payment was already marked approved by the atomic lock above

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
