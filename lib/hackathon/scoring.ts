/** Score, classement et cagnotte du hackathon. Fonctions pures : aucune lecture de base ici. */
import { RULES } from "./rules";

export type ProjectMetrics = {
  id: string;
  holders: number;      // holders réels (hors pool, hors équipe)
  volumeUsd: number;    // volume net dans la fenêtre, hors wallets de l'équipe
  votes: number;        // votes après plafond par wallet
  graduated: boolean;
  healthy: boolean;     // seuils de santé respectés
  excluded: boolean;
};
export type Ranked = ProjectMetrics & { score: number; rank: number; eligible: boolean };

const ratio = (v: number, max: number) => (max > 0 ? v / max : 0);

/** Chaque mesure est divisée par la meilleure valeur du classement : le score va de 0 à 100. */
export function rankProjects(list: ProjectMetrics[]): Ranked[] {
  const live = list.filter((p) => !p.excluded);
  const maxH = Math.max(0, ...live.map((p) => p.holders));
  const maxV = Math.max(0, ...live.map((p) => p.volumeUsd));
  const maxO = Math.max(0, ...live.map((p) => p.votes));
  const w = RULES.weights;
  const scored = live.map((p) => ({
    ...p,
    score: Math.round((w.holders * ratio(p.holders, maxH) + w.volume * ratio(p.volumeUsd, maxV) + w.votes * ratio(p.votes, maxO)) * 10_000) / 100,
    eligible: p.graduated && p.healthy,
    rank: 0,
  }));
  scored.sort((a, b) => b.score - a.score || b.volumeUsd - a.volumeUsd || a.id.localeCompare(b.id));
  scored.forEach((p, i) => { p.rank = i + 1; });
  return scored;
}

/** Cagnotte : 50 % de la part plateforme des frais, sur le volume des tokens du hackathon. */
export function prizePool(volumes: { volumeUsd: number; platformRate: number }[]): number {
  const fees = volumes.reduce((s, v) => s + Math.max(0, v.volumeUsd) * v.platformRate, 0);
  return Math.floor(fees * RULES.poolShareOfPlatformFees * 100) / 100;
}

/** Palier atteint : le plus haut palier fixe qui tient dans la cagnotte (0 si aucun). */
export const TIERS = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000] as const;
export function tierReached(pool: number): number {
  let t = 0;
  for (const x of TIERS) if (pool >= x) t = x;
  return t;
}
export function nextTier(pool: number): number | null {
  return TIERS.find((x) => x > pool) ?? null;
}

/** Montant par rang (rang 1 = index 0) pour une cagnotte donnée. Le montant versé est celui du palier atteint. */
export function prizeTable(pool: number): number[] {
  const tier = tierReached(pool);
  // Sous 10 000 $ : 1 000 $ par projet, du 1er vers le bas, tant que la cagnotte le permet.
  if (tier === 0) return Array.from({ length: Math.floor(pool / 1000) }, () => 1000);
  const rep = (n: number, v: number) => Array.from({ length: n }, () => v);
  if (tier === 10_000) return rep(10, 1000);
  if (tier === 25_000) return rep(50, 500);
  if (tier === 50_000) return [3500, ...rep(2, 3000), ...rep(7, 1700), ...rep(20, 930), ...rep(20, 500)];
  // 100 000 $ et au-dessus : même forme, multipliée par (palier / 100 000)
  const base = [5000, ...rep(2, 4500), ...rep(7, 3200), ...rep(20, 1800), ...rep(20, 1380)];
  const k = tier / 100_000;
  return base.map((v) => Math.round(v * k));
}

/** Prix par projet : les projets éligibles, dans l'ordre du classement, reçoivent les montants du palier. */
export function assignPrizes(ranked: Ranked[], pool: number): Map<string, number> {
  const table = prizeTable(pool);
  const out = new Map<string, number>();
  ranked.filter((p) => p.eligible).forEach((p, i) => { if (i < table.length) out.set(p.id, table[i]); });
  return out;
}

/** Partage de la part des voteurs entre eux, au prorata de leurs votes (après plafond). */
export function splitVoterShare(prize: number, votesByWallet: Map<string, number>): Map<string, number> {
  const pot = prize * RULES.voterShare;
  const total = [...votesByWallet.values()].reduce((s, v) => s + v, 0);
  const out = new Map<string, number>();
  if (!(total > 0)) return out;
  for (const [w, v] of votesByWallet) out.set(w, Math.floor((pot * v / total) * 100) / 100);
  return out;
}

export type HealthInput = {
  holders: number; top10Pct: number; biggestPct: number; bundlePct: number;
  priceRatio: number | null;   // prix / prix de graduation ; null = non mesuré
  hadVolume7d: boolean; frozenIntact: boolean;
};
export function evaluateHealth(m: HealthInput): { healthy: boolean; reasons: string[] } {
  const h = RULES.health;
  const reasons: string[] = [];
  if (m.holders < h.minHolders) reasons.push("holders");
  if (m.top10Pct > h.maxTop10Pct) reasons.push("concentration");
  if (m.biggestPct > h.maxBiggestPct) reasons.push("biggest_holder");
  if (m.bundlePct > h.maxBundlePct) reasons.push("bundle");
  if (m.priceRatio !== null && m.priceRatio < h.minPriceRatio) reasons.push("price");
  if (!m.hadVolume7d) reasons.push("volume");
  if (!m.frozenIntact) reasons.push("frozen_tokens");
  return { healthy: reasons.length === 0, reasons };
}
