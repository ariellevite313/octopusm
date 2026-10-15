/**
 * Gains créateur d'un wallet (claims réels) — utilisé pour l'image partageable
 * et la page de partage. Même source que /api/dashboard/creator-stats.
 */
import { createAdminClient } from "@/lib/supabase/server";

export type GainsPeriod = "24h" | "7d" | "30d" | "all";
export const GAINS_PERIODS: Record<GainsPeriod, number | null> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
  all: null,
};

export type CreatorGains = {
  wallet: string;
  name: string;
  avatarSrc: string | null;
  currency: "SOL" | "USDC";
  total: number;
  refCode: string | null;
  history: { t: number; amount: number }[];
};

export async function getCreatorGains(wallet: string): Promise<CreatorGains> {
  const isArc = wallet.startsWith("0x");
  const chain = isArc ? "arc" : "solana";
  const field = isArc ? "amount_usdc" : "amount_sol";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [claimsRes, walletRes, refRes] = await Promise.all([
    admin.from("creator_fee_claims").select(`${field}, claimed_at`).eq("chain", chain).ilike("wallet", isArc ? wallet.toLowerCase() : wallet),
    admin.from("wallets").select("username, display_name, avatar_src").eq("address", wallet).maybeSingle(),
    admin.from("referral_codes").select("code").eq("wallet_address", wallet).maybeSingle(),
  ]);

  const history = ((claimsRes.data ?? []) as Record<string, string>[])
    .filter(r => r.claimed_at)
    .map(r => ({ t: new Date(r.claimed_at).getTime(), amount: parseFloat(r[field] ?? "0") || 0 }))
    .filter(h => !Number.isNaN(h.t))
    .sort((a, b) => a.t - b.t);

  const w = walletRes.data as { username: string | null; display_name: string | null; avatar_src: string | null } | null;
  return {
    wallet,
    name: w?.display_name?.trim() || w?.username?.trim() || `${wallet.slice(0, 4)}…${wallet.slice(-4)}`,
    avatarSrc: w?.avatar_src ?? null,
    currency: isArc ? "USDC" : "SOL",
    total: history.reduce((s, h) => s + h.amount, 0),
    refCode: (refRes.data as { code?: string } | null)?.code ?? null,
    history,
  };
}

/** Série cumulée sur la période (pour la courbe) + gain sur la période. */
export function gainsSeries(history: { t: number; amount: number }[], period: GainsPeriod, now = Date.now()) {
  const ms = GAINS_PERIODS[period];
  const start = ms ? now - ms : (history[0]?.t ?? now - 24 * 3600_000);
  let base = 0;
  for (const h of history) if (h.t < start) base += h.amount;
  const series: { t: number; v: number }[] = [{ t: start, v: base }];
  let v = base;
  for (const h of history) if (h.t >= start) { series.push({ t: h.t, v }); v += h.amount; series.push({ t: h.t, v }); }
  series.push({ t: now, v });
  return { series, start, end: now, gain: v - base };
}

export function fmtGain(n: number) {
  if (n === 0) return "0";
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}
