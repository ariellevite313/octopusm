import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc("is_admin");
  return !!data;
}

// GET /api/admin/pools/predictions?marketId=xxx
// Returns pending payments for a specific pool
export async function GET(req: Request) {
  const supabase = await createClient();
  if (!(await isAdmin(supabase)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const marketId = url.searchParams.get("marketId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const query = admin
    .from("payments")
    .select("id, payment_reference, market_id, selection_id, selection_label, user_wallet, amount_usdc, token, tx_signature, created_at, title")
    .eq("flow", "pool_prediction")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (marketId) query.eq("market_id", marketId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/admin/pools/predictions
// body: { action: "approve"|"reject", paymentId: string }
export async function POST(req: Request) {
  const supabase = await createClient();
  if (!(await isAdmin(supabase)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { action: string; paymentId: string };
  const { action, paymentId } = body;

  if (!paymentId) return NextResponse.json({ error: "paymentId required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // 1. Fetch market to get bet_token and validate option
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
    // Amount: for CLT bets amount_usdc stores the CLT amount (since we don't have a separate column)
    // We use amount_usdc as the canonical amount field regardless of token
    const amount = Number(payment.amount_usdc);

    // 2. Insert mutuel_bet
    const { error: betErr } = await admin
      .from("mutuel_bets")
      .insert({
        market_id:      payment.market_id,
        wallet_address: payment.user_wallet,
        option_id:      payment.selection_id,
        amount,
        token,
        tx_signature:   payment.tx_signature ?? null,
      });

    if (betErr)
      return NextResponse.json({ error: betErr.message }, { status: 500 });

    // 3. Update pool total
    const poolField = token === "usdc" ? "total_pool_usdc" : "total_pool_clt";
    const currentTotal = token === "usdc" ? market.total_pool_usdc : market.total_pool_clt;
    await admin
      .from("mutuel_markets")
      .update({ [poolField]: currentTotal + amount, bet_count: (market.bet_count ?? 0) + 1 })
      .eq("id", payment.market_id)
      .catch(() => null);

    // 4. Mark payment as approved
    const { error: updErr } = await admin
      .from("payments")
      .update({ status: "approved" })
      .eq("id", paymentId);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
