/** GET /api/referrals/leaderboard?period=30d|all : top 20 des parrains (gains USDC versés), public, rafraîchi chaque minute. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/profiles";

export const revalidate = 60;

export async function GET(req: Request) {
  const period = new URL(req.url).searchParams.get("period") === "30d" ? "30d" : "all";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let q = db.from("referral_commissions").select("referrer_wallet, referred_wallet, amount_usdc").gt("amount_usdc", 0).limit(50000);
  if (period === "30d") q = q.gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  const { data, error } = await q;
  if (error) return NextResponse.json({ entries: [] });
  const key = (w: string) => (/^0x/i.test(w) ? w.toLowerCase() : w);
  const agg = new Map<string, { wallet: string; usd: number; friends: Set<string> }>();
  for (const r of (data ?? []) as { referrer_wallet: string; referred_wallet: string; amount_usdc: number }[]) {
    const k = key(r.referrer_wallet), a = agg.get(k) ?? { wallet: r.referrer_wallet, usd: 0, friends: new Set<string>() };
    a.usd += Number(r.amount_usdc) || 0; a.friends.add(key(r.referred_wallet)); agg.set(k, a);
  }
  const top = [...agg.values()].sort((a, b) => b.usd - a.usd).slice(0, 20);
  const profiles = await getProfiles(db, top.map((t) => t.wallet));
  return NextResponse.json({
    period,
    entries: top.map((t, i) => ({ rank: i + 1, wallet: t.wallet, name: profiles.get(t.wallet)?.name ?? null, avatar: profiles.get(t.wallet)?.avatar_src ?? null, usd: Math.round(t.usd * 100) / 100, friends: t.friends.size })),
  });
}
