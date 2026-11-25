/**
 * GET /api/referrals/stats : tableau de bord du parrain connecté.
 * Gains du jour / 7 j / 30 j / total, estimation des 30 prochains jours, et la liste des filleuls
 * avec leur volume et ce qu'ils ont rapporté. Le wallet vient de la session.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { getProfiles } from "@/lib/profiles";
import { estimateNext30, gainsByPeriod } from "@/lib/referrals/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const me = s.wallet;
  const [{ data: refs }, { data: com }] = await Promise.all([
    db.from("referrals").select("referred_wallet, created_at").ilike("referrer_wallet", me).limit(2000),
    db.from("referral_commissions").select("referred_wallet, amount_usdc, amount_clt, created_at").ilike("referrer_wallet", me).order("created_at", { ascending: false }).limit(20000),
  ]);
  const referred = ((refs ?? []) as { referred_wallet: string; created_at?: string }[]);
  const rows = ((com ?? []) as { referred_wallet: string; amount_usdc: number; amount_clt: number; created_at: string }[]);
  const gains = rows.map((r) => ({ at: Date.parse(r.created_at), usd: Number(r.amount_usdc) || 0 }));

  // Volume des filleuls : achats de tokens payants pour moi + prédictions en USDC
  const wallets = referred.map((r) => r.referred_wallet);
  const vol = new Map<string, number>();
  const key = (w: string) => (/^0x/i.test(w) ? w.toLowerCase() : w);
  if (wallets.length) {
    const chunk = wallets.slice(0, 500);
    const [{ data: tr }, { data: pay }] = await Promise.all([
      db.from("trade_rewards").select("trader, volume_usd").eq("kind", "referral").ilike("beneficiary", me).limit(20000),
      db.from("payments").select("user_wallet, amount_usdc, token").in("user_wallet", chunk).neq("status", "rejected").limit(20000),
    ]);
    for (const r of (tr ?? []) as { trader: string; volume_usd: number }[]) vol.set(key(r.trader), (vol.get(key(r.trader)) ?? 0) + (Number(r.volume_usd) || 0));
    for (const r of (pay ?? []) as { user_wallet: string; amount_usdc: number; token: string | null }[]) {
      if ((r.token ?? "usdc") !== "usdc") continue;
      vol.set(key(r.user_wallet), (vol.get(key(r.user_wallet)) ?? 0) + (Number(r.amount_usdc) || 0));
    }
  }
  const earned = new Map<string, { usd: number; clt: number }>();
  for (const r of rows) {
    const k = key(r.referred_wallet), e = earned.get(k) ?? { usd: 0, clt: 0 };
    e.usd += Number(r.amount_usdc) || 0; e.clt += Number(r.amount_clt) || 0; earned.set(k, e);
  }
  const profiles = await getProfiles(db, wallets.slice(0, 300));
  const list = referred.map((r) => {
    const k = key(r.referred_wallet), p = profiles.get(r.referred_wallet);
    return {
      wallet: r.referred_wallet, name: p?.name ?? null, avatar: p?.avatar_src ?? null, joined: r.created_at ?? null,
      volume: Math.round((vol.get(k) ?? 0) * 100) / 100, earnedUsd: Math.round((earned.get(k)?.usd ?? 0) * 1e6) / 1e6, earnedClt: earned.get(k)?.clt ?? 0,
    };
  }).sort((a, b) => b.earnedUsd - a.earnedUsd || b.volume - a.volume);

  return NextResponse.json({
    gains: gainsByPeriod(gains),
    estimate30: estimateNext30(gains),
    friends: list.length,
    active: list.filter((f) => f.volume > 0).length,
    list: list.slice(0, 200),
  });
}
