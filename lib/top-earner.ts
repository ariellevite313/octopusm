/**
 * La couronne : les 5 wallets qui ont le plus gagné sur OM, en $ (chill, frais créateur, prédictions ; OMERO exclu),
 * le même classement que les « Top traders » du Terminal. Rien de définitif : recalculé toutes les 10 minutes,
 * un autre peut la prendre. Avantages : -30 % sur les boosts en Omero, -25 % sur les frais de trading du Terminal.
 */
import { loadEarnerRows, rankEarners } from "@/lib/top-earners";

export const CROWN_MAX = 5;
/** Réduction sur les boosts (token, OM Store) pour un porteur de couronne */
export const CROWN_BOOST_DISCOUNT = 0.3;
/** Frais de trading du Terminal pour un porteur de couronne : 0,3 % moins 25 % (arrondi à 22 bps, Jupiter veut un entier) */
export const CROWN_SWAP_FEE_BPS = 22;

let cache: { at: number; wallets: string[] } | null = null;

async function solUsd(): Promise<number> {
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", { signal: AbortSignal.timeout(4000) });
    return Number(((await r.json()) as { data?: { amount?: string } }).data?.amount) || 0;
  } catch { return 0; }
}

/** Les porteurs de couronne (5 au plus), du 1er au 5e. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function crownWallets(db: any): Promise<string[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.wallets;
  try {
    const top = rankEarners(await loadEarnerRows(db, await solUsd()), CROWN_MAX).filter((t) => t.usd > 0);
    cache = { at: Date.now(), wallets: top.map((t) => t.wallet) };
  } catch { cache = { at: Date.now(), wallets: cache?.wallets ?? [] }; }
  return cache.wallets;
}

/** Vrai si ce wallet porte la couronne en ce moment. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function hasCrown(db: any, wallet: string | null | undefined): Promise<boolean> {
  if (!wallet) return false;
  const w = await crownWallets(db).catch(() => [] as string[]);
  return /^0x/i.test(wallet) ? w.some((x) => x.toLowerCase() === wallet.toLowerCase()) : w.includes(wallet);
}

/** Prix d'un boost en Omero, réduit de 30 % pour un porteur de couronne. */
export const crownBoostCost = (cost: number, crown: boolean) => (crown ? Math.round(cost * (1 - CROWN_BOOST_DISCOUNT)) : cost);
