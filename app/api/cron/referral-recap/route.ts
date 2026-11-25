/**
 * GET /api/cron/referral-recap : récap de la semaine pour chaque parrain qui a gagné quelque chose (notification).
 * À appeler une fois par semaine (lundi). Une seule notification par parrain et par semaine (ref = semaine).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { cronDenied } from "@/lib/auth/cron";
import { isoDay, weekStart } from "@/lib/weekly-box";

export async function GET(req: Request) {
  const denied = cronDenied(req);
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const end = weekStart(new Date()), start = new Date(end.getTime() - 7 * 86_400_000);
  const { data, error } = await db.from("referral_commissions").select("referrer_wallet, referred_wallet, amount_usdc")
    .gte("created_at", start.toISOString()).lt("created_at", end.toISOString()).limit(50000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const agg = new Map<string, { usd: number; friends: Set<string> }>();
  for (const r of (data ?? []) as { referrer_wallet: string; referred_wallet: string; amount_usdc: number }[]) {
    const a = agg.get(r.referrer_wallet) ?? { usd: 0, friends: new Set<string>() };
    a.usd += Number(r.amount_usdc) || 0; a.friends.add(r.referred_wallet); agg.set(r.referrer_wallet, a);
  }
  let sent = 0;
  for (const [wallet, a] of agg) {
    if (a.usd <= 0) continue;
    const { error: e } = await db.from("notifications").insert({
      wallet: /^0x/i.test(wallet) ? wallet.toLowerCase() : wallet, kind: "referral_recap", actor: "omdotfun", ref: `week:${isoDay(start)}`,
      data: { usd: Math.round(a.usd * 100) / 100, friends: a.friends.size },
    });
    if (!e) sent++;
  }
  return NextResponse.json({ week: isoDay(start), referrers: agg.size, sent });
}
