import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// Minimums: 2 USDC, 500K CLT
const MIN: Record<string, number> = { usdc: 2, clawdtrust: 500_000 };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ withdrawals: [] });

  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("withdrawal_requests")
    .select("*")
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ withdrawals: data ?? [] });
}

/** DELETE /api/withdraw — cancel own pending withdrawal */
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { id: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient() as any;

  // Only allow deleting own pending requests (never approved/paid)
  const { data, error } = await admin
    .from("withdrawal_requests")
    .delete()
    .eq("id", id)
    .eq("wallet_address", wallet)
    .eq("status", "pending")
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0)
    return NextResponse.json(
      { error: "Request not found or cannot be cancelled (only pending requests can be cancelled)" },
      { status: 404 }
    );

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  // Auth
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Parse body
  let body: { token: string; amount: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { token, amount } = body;

  // Validate token
  if (!["usdc", "clawdtrust"].includes(token))
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  // Validate amount
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0)
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

  const min = MIN[token];
  if (parsed < min)
    return NextResponse.json(
      { error: `Minimum withdrawal is ${token === "usdc" ? `$${min} USDC` : `${(min / 1_000_000).toFixed(1)}M CLT`}` },
      { status: 400 }
    );

  const admin = createAdminClient() as any;

  // ── Calculer la balance réelle disponible côté serveur ────────────────────
  const isUsdc = token === "usdc";
  const isClt  = (t: string) => t === "clawdtrust" || t === "clt";

  const [predRes, commRes, updownRes, mutuelRes, withdrawnRes] = await Promise.all([
    // Prediction history wins
    admin
      .from("prediction_history_with_status")
      .select("token, net_reward, result_status")
      .eq("wallet_address", wallet),

    // Referral commissions
    admin
      .from("referral_commissions")
      .select("amount_usdc, amount_clt")
      .eq("referrer_wallet", wallet),

    // Up/Down wins
    admin
      .from("updown_bets")
      .select("token, payout")
      .eq("wallet_address", wallet)
      .in("status", ["won", "claimed", "paid"]),

    // Mutuel pool wins
    admin
      .from("mutuel_bets")
      .select("token, payout_amount")
      .eq("wallet_address", wallet)
      .not("payout_amount", "is", null),

    // Deduct all non-rejected withdrawals (paid + in-flight)
    admin
      .from("withdrawal_requests")
      .select("token, amount")
      .eq("wallet_address", wallet)
      .in("status", ["paid", "pending", "approved"]),
  ]);

  const isWin = (s: string) => ["win", "claimed", "paid"].includes(s);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const predGains = (predRes.data ?? []).filter((b: any) =>
    isWin(b.result_status) && (isUsdc ? b.token === "usdc" : isClt(b.token))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).reduce((s: number, b: any) => s + (b.net_reward ?? 0), 0);

  const commGains = isUsdc
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (commRes.data ?? []).reduce((s: number, r: any) => s + (r.amount_usdc ?? 0), 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : (commRes.data ?? []).reduce((s: number, r: any) => s + (r.amount_clt ?? 0), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updownGains = (updownRes.data ?? []).filter((b: any) =>
    isUsdc ? b.token === "usdc" || !b.token : isClt(b.token ?? "")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).reduce((s: number, b: any) => s + (b.payout ?? 0), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutuelGains = (mutuelRes.data ?? []).filter((b: any) =>
    isUsdc ? b.token === "usdc" || !b.token : isClt(b.token ?? "")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).reduce((s: number, b: any) => s + (b.payout_amount ?? 0), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withdrawn = (withdrawnRes.data ?? []).filter((w: any) =>
    isUsdc ? w.token === "usdc" : w.token === "clawdtrust"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).reduce((s: number, w: any) => s + (w.amount ?? 0), 0);

  const availableBalance = Math.max(0, predGains + commGains + updownGains + mutuelGains - withdrawn);

  console.log(`[withdraw] wallet=${wallet} token=${token} requested=${parsed} available=${availableBalance}`);

  if (parsed > availableBalance)
    return NextResponse.json(
      { error: `Insufficient balance. Available: ${isUsdc ? `$${availableBalance.toFixed(2)} USDC` : `${Math.floor(availableBalance).toLocaleString("en-US")} CLT`}` },
      { status: 400 }
    );

  // ── Check pour retrait en attente (un à la fois par token) ───────────────
  const { data: existing } = await admin
    .from("withdrawal_requests")
    .select("id, status")
    .eq("wallet_address", wallet)
    .eq("token", token)
    .in("status", ["pending", "approved"])
    .limit(1);

  if (existing && existing.length > 0) {
    const st = existing[0].status === "approved" ? "approuvée" : "en attente";
    return NextResponse.json(
      { error: `Une demande de retrait ${st} existe déjà pour ce token. L'admin doit la marquer comme payée avant d'en soumettre une nouvelle.` },
      { status: 409 }
    );
  }

  // Insert
  const { error } = await admin.from("withdrawal_requests").insert({
    wallet_address: wallet,
    token,
    amount: parsed,
    status: "pending",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
