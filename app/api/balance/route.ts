import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const isClt  = (t: string) => t === "clawdtrust" || t === "clt";
const isUsdc = (t: string) => t === "usdc";
const isWin  = (s: string) => ["win", "claimed", "paid"].includes(s);

export async function GET() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient() as any;

  const [predRes, commRes, updownRes, mutuelRes, withdrawnRes, octoRes] = await Promise.all([
    admin
      .from("prediction_history_with_status")
      .select("token, net_reward, result_status")
      .eq("wallet_address", wallet),

    admin
      .from("referral_commissions")
      .select("amount_usdc, amount_clt")
      .eq("referrer_wallet", wallet),

    admin
      .from("updown_bets")
      .select("token, payout")
      .eq("wallet_address", wallet)
      .in("status", ["won", "claimed", "paid"]),

    admin
      .from("mutuel_bets")
      .select("token, payout_amount")
      .eq("wallet_address", wallet)
      .not("payout_amount", "is", null),

    admin
      .from("withdrawal_requests")
      .select("token, amount")
      .eq("wallet_address", wallet)
      .in("status", ["paid", "pending", "approved"]),

    // adminDb bypasses RLS — octo_transactions is written by service key (REF-D fix)
    admin
      .from("octo_transactions")
      .select("amount")
      .eq("wallet_address", wallet),
  ]);

  // ── USDC ──────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const predUsdc = (predRes.data ?? []).filter((b: any) => isUsdc(b.token) && isWin(b.result_status))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((s: number, b: any) => s + (b.net_reward ?? 0), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commUsdc = (commRes.data ?? []).reduce((s: number, r: any) => s + (r.amount_usdc ?? 0), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updownUsdc = (updownRes.data ?? []).filter((b: any) => isUsdc(b.token ?? "usdc"))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((s: number, b: any) => s + (b.payout ?? 0), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutuelUsdc = (mutuelRes.data ?? []).filter((b: any) => isUsdc(b.token ?? "usdc"))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((s: number, b: any) => s + (b.payout_amount ?? 0), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withdrawnUsdc = (withdrawnRes.data ?? []).filter((w: any) => w.token === "usdc")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((s: number, w: any) => s + (w.amount ?? 0), 0);

  const usdcBalance = Math.max(0, predUsdc + commUsdc + updownUsdc + mutuelUsdc - withdrawnUsdc);

  // ── CLT ───────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const predClt = (predRes.data ?? []).filter((b: any) => isClt(b.token) && isWin(b.result_status))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((s: number, b: any) => s + (b.net_reward ?? 0), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commClt = (commRes.data ?? []).reduce((s: number, r: any) => s + (r.amount_clt ?? 0), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updownClt = (updownRes.data ?? []).filter((b: any) => isClt(b.token ?? ""))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((s: number, b: any) => s + (b.payout ?? 0), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutuelClt = (mutuelRes.data ?? []).filter((b: any) => isClt(b.token ?? ""))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((s: number, b: any) => s + (b.payout_amount ?? 0), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withdrawnClt = (withdrawnRes.data ?? []).filter((w: any) => w.token === "clawdtrust")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((s: number, w: any) => s + (w.amount ?? 0), 0);

  const cltBalance = Math.max(0, predClt + commClt + updownClt + mutuelClt - withdrawnClt);

  // ── OCTO ──────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const octoBalance = (octoRes.data ?? []).reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);

  return NextResponse.json({ usdcBalance, cltBalance, octoBalance });
}
