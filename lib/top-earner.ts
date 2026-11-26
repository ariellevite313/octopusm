/**
 * La couronne : le wallet qui a le plus gagné sur OM, en $ (chill, frais créateur, prédictions ; OMERO exclu),
 * le même classement que les « Top traders » du Terminal. Cache 10 minutes.
 */
import { loadEarnerRows, rankEarners } from "@/lib/top-earners";

let cache: { at: number; wallet: string | null } | null = null;

async function solUsd(): Promise<number> {
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", { signal: AbortSignal.timeout(4000) });
    return Number(((await r.json()) as { data?: { amount?: string } }).data?.amount) || 0;
  } catch { return 0; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function topEarnerWallet(db: any): Promise<string | null> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.wallet;
  try {
    const [first] = rankEarners(await loadEarnerRows(db, await solUsd()), 1);
    cache = { at: Date.now(), wallet: first && first.usd > 0 ? first.wallet : null };
  } catch { cache = { at: Date.now(), wallet: cache?.wallet ?? null }; }
  return cache.wallet;
}
