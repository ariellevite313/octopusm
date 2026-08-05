import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const revalidate = 0;

const isWin = (s: string) => ["win", "won", "claimed", "paid"].includes(s);

export async function GET() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient() as any;

  const [updownRes, mutuelRes, predRes, referralsRes, refOctoRes, refCodeRes] = await Promise.all([
    admin.from("updown_bets").select("status").eq("wallet_address", wallet),
    admin.from("mutuel_bets").select("payout_amount").eq("wallet_address", wallet),
    admin.from("prediction_history_with_status").select("result_status").eq("wallet_address", wallet),
    admin.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_wallet", wallet),
    admin.from("octo_transactions").select("amount").eq("wallet_address", wallet).eq("type", "referral"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("referral_codes").select("code").eq("wallet_address", wallet).maybeSingle(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updownBets: any[] = updownRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutuelBets: any[] = mutuelRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const predBets: any[] = predRes.data ?? [];

  const updownWins  = updownBets.filter(b => isWin(b.status ?? "")).length;
  const mutuelWins  = mutuelBets.filter(b => b.payout_amount != null && Number(b.payout_amount) > 0).length;
  const predWins    = predBets.filter(b => isWin(b.result_status ?? "")).length;

  const bets_count    = updownBets.length + mutuelBets.length + predBets.length;
  const win_count     = updownWins + mutuelWins + predWins;
  const win_rate      = bets_count > 0 ? Math.round((win_count / bets_count) * 100) : 0;

  const referral_count = referralsRes.count ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const referral_octo  = (refOctoRes.data ?? []).reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
  const referral_code: string | null = refCodeRes.data?.code ?? null;

  return NextResponse.json({ bets_count, win_count, win_rate, referral_count, referral_octo, referral_code });
}
