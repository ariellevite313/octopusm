import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { FEE_RATE, RESERVE_FEE_RATE, computeReward } from "@/lib/market/betting";

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("is_admin");
  return !!data;
}

async function handleManual(
  supabase: Awaited<ReturnType<typeof createClient>>,
  body: Record<string, unknown>
) {
  const { userWallet, title, amount, token, txSignature, flow } = body;
  if (!userWallet || !title || !amount || !token || !txSignature || !flow)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const paymentReference = `manual-${Date.now()}`;
  const id = `manual-${paymentReference}`;

  const { error } = await (supabase as any).from("payments").insert({
    id,
    payment_request_id: paymentReference,
    payment_reference: String(txSignature),
    flow,
    title: String(title),
    subtitle: "Manual confirmation",
    user_wallet: String(userWallet),
    recipient_wallet: String(userWallet),
    amount_usdc: Number(amount),
    reserve_fee_usdc: 0,
    total_paid_usdc: Number(amount),
    token,
    status: "approved",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  if (!(await isAdmin(supabase)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;

  if (body.action === "manual") return handleManual(supabase, body);

  // approve / reject
  const { paymentId, status } = body;
  if (!paymentId || !["approved", "rejected"].includes(String(status)))
    return NextResponse.json({ error: "paymentId and status required" }, { status: 400 });

  const { data: { user } } = await supabase.auth.getUser();
  const adminWallet = user?.user_metadata?.wallet_address ?? null;

  const admin = createAdminClient() as any;

  // Fetch the payment first
  const { data: payment, error: fetchErr } = await admin
    .from("payments")
    .select("*")
    .eq("id", String(paymentId))
    .single();

  if (fetchErr || !payment)
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  // Update payment status
  const { error } = await admin
    .from("payments")
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by_wallet: adminWallet })
    .eq("id", String(paymentId));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If approving a prediction payment, create prediction_history row
  if (status === "approved" && payment.flow === "prediction" && payment.market_id && payment.selection_id) {
    const amount = Number(payment.amount_usdc) || 0;
    // We need the multiplier — try to fetch it from prediction_markets options
    const { data: market } = await admin
      .from("prediction_markets")
      .select("options")
      .eq("id", payment.market_id)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any[] = market?.options ?? [];
    const option = options.find((o: any) => o.id === payment.selection_id);
    const multiplier = option?.multiplier ?? 2;

    const { reserveFee, totalCharged, grossReward, netReward } = computeReward(amount, multiplier);

    const alreadyExists = await admin
      .from("prediction_history")
      .select("id")
      .eq("payment_reference", payment.payment_reference)
      .maybeSingle();

    if (!alreadyExists.data) {
      await admin.from("prediction_history").insert({
        id:                   crypto.randomUUID(),
        market_id:            payment.market_id,
        market_title:         payment.title ?? "",
        category_label:       payment.category_label ?? "",
        selection_id:         payment.selection_id,
        selection_label:      payment.selection_label ?? payment.subtitle ?? "",
        amount,
        reserve_fee:          reserveFee,
        total_charged:        totalCharged,
        claim_fee_rate:       FEE_RATE,
        payout_multiple:      multiplier,
        gross_reward:         grossReward,
        net_reward:           netReward,
        wallet_address:       payment.user_wallet,
        payment_reference:    payment.payment_reference,
        payment_request_id:   payment.payment_request_id,
        token:                payment.token ?? "usdc",
        reported_at:          payment.created_at ?? new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
