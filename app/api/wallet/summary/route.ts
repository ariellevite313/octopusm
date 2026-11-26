/**
 * GET /api/wallet/summary : ce que l'accueil du wallet (cartes, sur téléphone) montre en plus des tokens :
 * Omero (solde, total, niveau, rang) et les prédictions en cours (marché, choix, mise, gain estimé, chance, fin).
 * Lecture seule, portefeuille connecté uniquement.
 */
import { NextResponse } from "next/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { createAdminClient } from "@/lib/supabase/server";
import { OCTO_TIERS } from "@/components/leaderboard/octo-tier-badge";

export const dynamic = "force-dynamic";
const isEvm = (w: string) => /^0x[0-9a-fA-F]{40}$/.test(w);
type Opt = { id: string; label: string };

export async function GET() {
  const wallet = await getWalletAddress();
  if (!wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const by = isEvm(wallet) ? "ilike" : "eq";

  const [{ data: lb }, { data: tx }, { data: bets }] = await Promise.all([
    db.from("leaderboard_octo").select("total_octo")[by]("wallet_address", wallet).order("total_octo", { ascending: false }).limit(1).maybeSingle(),
    db.from("octo_transactions").select("amount")[by]("wallet_address", wallet).limit(50_000),
    db.from("mutuel_bets").select("market_id, option_id, amount, token, mutuel_markets(title, slug, status, options, betting_closes_at)")[by]("wallet_address", wallet).order("created_at", { ascending: false }).limit(60),
  ]);

  const total = Number(lb?.total_octo ?? 0);
  const balance = ((tx ?? []) as { amount: number }[]).reduce((s, t) => s + Number(t.amount || 0), 0);
  let rank: number | null = null;
  if (total > 0) {
    const { count } = await db.from("leaderboard_octo").select("*", { count: "exact", head: true }).gt("total_octo", total);
    rank = (Number(count) || 0) + 1;
  }
  let idx = -1;
  OCTO_TIERS.forEach((t, i) => { if (total >= t.min) idx = i; });
  const next = OCTO_TIERS[idx + 1] ?? null;

  // Prédictions en cours : une par marché (mises additionnées), les 3 qui finissent le plus tôt
  type Row = { market_id: string; option_id: string; amount: number; token: string; mutuel_markets: { title: string; slug: string; status: string; options: Opt[] | string; betting_closes_at: string } | null };
  const open = ((bets ?? []) as Row[]).filter((b) => b.mutuel_markets?.status === "active");
  const byMarket = new Map<string, Row & { stake: number }>();
  for (const b of open) {
    const k = `${b.market_id}:${b.option_id}`;
    const cur = byMarket.get(k);
    if (cur) cur.stake += Number(b.amount || 0); else byMarket.set(k, { ...b, stake: Number(b.amount || 0) });
  }
  const mine = [...byMarket.values()].sort((a, b) => Date.parse(a.mutuel_markets!.betting_closes_at) - Date.parse(b.mutuel_markets!.betting_closes_at)).slice(0, 3);

  // Gain estimé (pari mutuel) : mise × total du marché / total de l'option choisie, dans le même token
  const pools = new Map<string, { total: number; opt: Map<string, number> }>();
  if (mine.length) {
    const { data: all } = await db.from("mutuel_bets").select("market_id, option_id, amount, token").in("market_id", [...new Set(mine.map((m) => m.market_id))]).limit(20_000);
    for (const b of (all ?? []) as { market_id: string; option_id: string; amount: number; token: string }[]) {
      const k = `${b.market_id}:${b.token}`;
      const p = pools.get(k) ?? { total: 0, opt: new Map() };
      p.total += Number(b.amount || 0);
      p.opt.set(b.option_id, (p.opt.get(b.option_id) ?? 0) + Number(b.amount || 0));
      pools.set(k, p);
    }
  }
  const predictions = mine.map((m) => {
    const mk = m.mutuel_markets!;
    const opts: Opt[] = typeof mk.options === "string" ? JSON.parse(mk.options) : mk.options ?? [];
    const p = pools.get(`${m.market_id}:${m.token}`);
    const optTotal = p?.opt.get(m.option_id) ?? 0;
    return {
      title: mk.title,
      slug: mk.slug,
      choice: opts.find((o) => o.id === m.option_id)?.label ?? "",
      stake: m.stake,
      token: m.token === "usdc" ? "USDC" : m.token.toUpperCase(),
      gain: p && optTotal > 0 ? (m.stake * p.total) / optTotal : null,
      chance: p && p.total > 0 ? Math.round((optTotal / p.total) * 100) : null,
      closes: mk.betting_closes_at,
    };
  });

  return NextResponse.json({
    omero: { balance, total, level: idx >= 0 ? OCTO_TIERS[idx].label : null, next: next?.label ?? null, left: next ? Math.max(0, next.min - total) : null, rank },
    predictions,
  });
}
