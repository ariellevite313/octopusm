/**
 * Serveur : vue « Pulse » du Terminal (Solana), comme les terminaux de memecoins :
 * nouveaux tokens sur une courbe de lancement, tokens les plus proches de la graduation, tokens tout juste migrés.
 * Source : GeckoTerminal (gratuit), mis en cache 20 s pour rester sous sa limite de requêtes.
 */
import { mapPools, type GtPool, type TerminalToken } from "@/lib/terminal";

const GT = "https://api.geckoterminal.com/api/v2/networks/solana";
/** Courbes de lancement (bonding curves) : pump.fun, Meteora DBC (dont OM), LetsBonk, Raydium LaunchLab */
const CURVES = new Set(["pump-fun", "meteora-dbc", "letsbonk-fun", "raydium-launchlab"]);
/** Où les tokens arrivent après la graduation */
const MIGRATED = new Set(["pumpswap", "meteora-damm-v2", "meteora", "raydium", "raydium-cpmm"]);

export type PulseToken = TerminalToken & { dexId: string };
export type Pulse = { fresh: PulseToken[]; stretch: PulseToken[]; migrated: PulseToken[] };

let cache: { at: number; v: Pulse } | null = null;

async function gt(path: string): Promise<{ data?: GtPool[]; included?: { id: string; attributes: { address: string; name: string; symbol: string; image_url?: string | null } }[] }> {
  try {
    const r = await fetch(`${GT}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    return r.ok ? r.json() : {};
  } catch { return {}; }
}

function withDex(j: Awaited<ReturnType<typeof gt>>): PulseToken[] {
  const dexOf = new Map((j.data ?? []).map((p) => [p.attributes.address, p.relationships?.dex?.data?.id ?? ""]));
  return mapPools(j, "solana").map((t) => {
    const dexId = dexOf.get(t.pool) ?? "";
    // Courbes de lancement : GeckoTerminal ne donne pas toujours la capitalisation, l'offre y est d'un milliard
    const mcap = t.mcap || (CURVES.has(dexId) && t.price ? t.price * 1e9 : t.mcap);
    return { ...t, mcap, dexId };
  });
}

export async function pulse(): Promise<Pulse> {
  if (cache && Date.now() - cache.at < 20_000) return cache.v;
  const [n1, n2, n3, pf, pf2, dbc] = await Promise.all([
    gt("/new_pools?include=base_token,dex&page=1"),
    gt("/new_pools?include=base_token,dex&page=2"),
    gt("/new_pools?include=base_token,dex&page=3"),
    gt("/dexes/pump-fun/pools?include=base_token,dex&sort=h24_tx_count_desc"),
    gt("/dexes/pump-fun/pools?include=base_token,dex&sort=h24_tx_count_desc&page=2"),
    gt("/dexes/meteora-dbc/pools?include=base_token,dex&sort=h24_tx_count_desc"),
  ]);
  const news = [...withDex(n1), ...withDex(n2), ...withDex(n3)];
  const byNew = (a: PulseToken, b: PulseToken) => Date.parse(b.createdAt ?? "0") - Date.parse(a.createdAt ?? "0");
  const uniq = (l: PulseToken[]) => { const s = new Set<string>(); return l.filter((t) => (s.has(t.mint) ? false : (s.add(t.mint), true))); };

  const fresh = uniq(news.filter((t) => CURVES.has(t.dexId))).sort(byNew).slice(0, 40);
  // Proches de la graduation : courbes actives des dernières 24 h, par capitalisation décroissante
  const day = Date.now() - 86_400_000;
  const stretch = uniq([...withDex(pf), ...withDex(pf2), ...withDex(dbc)].filter((t) => CURVES.has(t.dexId) && Date.parse(t.createdAt ?? "0") >= day && (t.mcap ?? 0) >= 15_000))
    .sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0)).slice(0, 40);
  const migrated = uniq(news.filter((t) => MIGRATED.has(t.dexId) && (t.liquidity ?? 0) >= 2_000)).sort(byNew).slice(0, 40);

  const v = { fresh, stretch, migrated };
  cache = { at: Date.now(), v };
  return v;
}
