import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await (supabase as any)
    .from("payments")
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by_wallet: adminWallet })
    .eq("id", paymentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
