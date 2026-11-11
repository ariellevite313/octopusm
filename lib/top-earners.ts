/**
 * Top traders du Terminal : ceux qui gagnent sur OM, en $ (OMERO exclu).
 *   - « Chill ton sac » : part des frais reçue (swaps.ref_usd)
 *   - Lancement de token : frais créateur réclamés (creator_fee_claims, SOL au prix du marché, USDC sur Arc)
 *   - Marchés de prédiction : gains nets en USDC (mutuel_bets : paiement - mise, si positif)
 */
export type EarnerParts = { chill: number; creator: number; predict: number };
export type Earner = { wallet: string; usd: number; parts: EarnerParts };

type Row = { wallet: string; usd: number; kind: keyof EarnerParts };

/** Additionne les gains par portefeuille et trie du plus gros au plus petit. */
export function rankEarners(rows: Row[], limit = 10): Earner[] {
  const m = new Map<string, Earner>();
  for (const r of rows) {
    if (!r.wallet || !(r.usd > 0) || !Number.isFinite(r.usd)) continue;
    const e = m.get(r.wallet) ?? { wallet: r.wallet, usd: 0, parts: { chill: 0, creator: 0, predict: 0 } };
    e.usd += r.usd; e.parts[r.kind] += r.usd;
    m.set(r.wallet, e);
  }
  return [...m.values()].sort((a, b) => b.usd - a.usd).slice(0, limit);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadEarnerRows(db: any, solUsd: number): Promise<Row[]> {
  const rows: Row[] = [];
  const [chill, claims, bets] = await Promise.all([
    db.from("swaps").select("ref_wallet, ref_usd").not("ref_wallet", "is", null).limit(20_000),
    db.from("creator_fee_claims").select("wallet, amount_sol, amount_usdc, chain").limit(20_000),
    db.from("mutuel_bets").select("wallet_address, amount, payout_amount").eq("token", "usdc").not("payout_amount", "is", null).limit(50_000),
  ]);
  for (const r of (chill.data ?? []) as { ref_wallet: string; ref_usd: number | null }[]) rows.push({ wallet: r.ref_wallet, usd: Number(r.ref_usd ?? 0), kind: "chill" });
  for (const c of (claims.data ?? []) as { wallet: string; amount_sol: number | null; amount_usdc: number | null; chain: string | null }[]) {
    const arc = c.chain === "arc" || c.wallet?.startsWith("0x");
    rows.push({ wallet: c.wallet, usd: arc ? Number(c.amount_usdc ?? 0) : Number(c.amount_sol ?? 0) * solUsd, kind: "creator" });
  }
  for (const b of (bets.data ?? []) as { wallet_address: string; amount: number | null; payout_amount: number | null }[]) {
    rows.push({ wallet: b.wallet_address, usd: Number(b.payout_amount ?? 0) - Number(b.amount ?? 0), kind: "predict" });
  }
  return rows;
}
