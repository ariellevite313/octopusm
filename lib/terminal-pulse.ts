/**
 * Serveur : vue « Pulse » du Terminal (Solana), comme les terminaux de memecoins :
 * nouveaux tokens sur une courbe de lancement, tokens les plus proches de la graduation, tokens tout juste migrés.
 * Source : GeckoTerminal (gratuit), mis en cache 20 s pour rester sous sa limite de requêtes.
 */
import { createAdminClient } from "@/lib/supabase/server";
import { GT_NET, mapPools, type GtPool, type TerminalChain, type TerminalToken } from "@/lib/terminal";

const GT = "https://api.geckoterminal.com/api/v2/networks";
/** Courbes de lancement (bonding curves) : pump.fun, Meteora DBC (dont OM), LetsBonk, Raydium LaunchLab */
const CURVES = new Set(["pump-fun", "meteora-dbc", "letsbonk-fun", "raydium-launchlab"]);
/** Où les tokens arrivent après la graduation */
const MIGRATED = new Set(["pumpswap", "meteora-damm-v2", "meteora", "raydium", "raydium-cpmm"]);

export type PulseToken = TerminalToken & { dexId: string };
export type Pulse = { fresh: PulseToken[]; stretch: PulseToken[]; migrated: PulseToken[] };

const cache = new Map<string, { at: number; v: Pulse }>();
/** Dernière bonne réponse de chaque requête : une erreur (limite de GeckoTerminal) ne vide jamais les listes */
const last = new Map<string, GtRes>();
type GtRes = { data?: GtPool[]; included?: { id: string; attributes: { address: string; name: string; symbol: string; image_url?: string | null } }[] };

async function gt(net: string, path: string): Promise<GtRes> {
  const key = `${net}${path}`;
  try {
    const r = await fetch(`${GT}/${net}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (r.ok) { const j = (await r.json()) as GtRes; if (j.data?.length) { last.set(key, j); return j; } }
  } catch { /* repli ci-dessous */ }
  return last.get(key) ?? {};
}

function withDex(j: GtRes, chain: TerminalChain = "solana"): PulseToken[] {
  const dexOf = new Map((j.data ?? []).map((p) => [p.attributes.address, p.relationships?.dex?.data?.id ?? ""]));
  return mapPools(j, chain).map((t) => {
    const dexId = dexOf.get(t.pool) ?? "";
    // Courbes de lancement : GeckoTerminal ne donne pas toujours la capitalisation, l'offre y est d'un milliard
    const mcap = t.mcap || (CURVES.has(dexId) && t.price ? t.price * 1e9 : t.mcap);
    return { ...t, mcap, dexId };
  });
}

const inflight = new Map<string, Promise<Pulse>>();

/** Pulse d'un réseau. Solana : courbes de lancement ; autres réseaux : nouvelles pools, les plus actives, les plus liquides. */
export async function pulse(chain: TerminalChain = "solana"): Promise<Pulse> {
  const hit = cache.get(chain);
  if (hit && Date.now() - hit.at < (chain === "solana" ? 15_000 : 30_000)) return hit.v;
  const running = inflight.get(chain);
  if (running) return running;
  const job = (chain === "solana" ? solanaPulse() : evmPulse(chain)).then((v) => {
    // Une colonne vide (GeckoTerminal saturé) garde la précédente
    const prev = cache.get(chain)?.v;
    const keep = { fresh: v.fresh.length ? v.fresh : prev?.fresh ?? [], stretch: v.stretch.length ? v.stretch : prev?.stretch ?? [], migrated: v.migrated.length ? v.migrated : prev?.migrated ?? [] };
    cache.set(chain, { at: Date.now(), v: keep });
    return keep;
  }).finally(() => inflight.delete(chain));
  inflight.set(chain, job);
  return job;
}

async function evmPulse(chain: TerminalChain): Promise<Pulse> {
  const net = GT_NET[chain];
  if (!net) return { fresh: [], stretch: [], migrated: [] };
  const [n1, n2] = await Promise.all([gt(net, "/new_pools?include=base_token,dex&page=1"), gt(net, "/new_pools?include=base_token,dex&page=2")]);
  const uniq = (l: PulseToken[]) => { const s = new Set<string>(); return l.filter((t) => (s.has(t.mint) ? false : (s.add(t.mint), true))); };
  const news = uniq([...withDex(n1, chain), ...withDex(n2, chain)]);
  const byNew = (a: PulseToken, b: PulseToken) => Date.parse(b.createdAt ?? "0") - Date.parse(a.createdAt ?? "0");
  return {
    fresh: [...news].sort(byNew).slice(0, 40),
    stretch: news.filter((t) => (t.volume24h ?? 0) > 0).sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, 40),
    migrated: news.filter((t) => (t.liquidity ?? 0) >= 5_000).sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0)).slice(0, 40),
  };
}

async function solanaPulse(): Promise<Pulse> {
  const S = "solana";
  const [n1, n2, n3, pf, pf2, dbc] = await Promise.all([
    gt(S, "/new_pools?include=base_token,dex&page=1"),
    gt(S, "/new_pools?include=base_token,dex&page=2"),
    gt(S, "/new_pools?include=base_token,dex&page=3"),
    gt(S, "/dexes/pump-fun/pools?include=base_token,dex&sort=h24_tx_count_desc"),
    gt(S, "/dexes/pump-fun/pools?include=base_token,dex&sort=h24_tx_count_desc&page=2"),
    gt(S, "/dexes/meteora-dbc/pools?include=base_token,dex&sort=h24_tx_count_desc"),
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

  // Tokens lancés sur OM : marqués pour afficher le logo OM à la place de la plateforme
  const all = [...fresh, ...stretch, ...migrated].map((t) => t.mint);
  if (all.length) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createAdminClient() as any;
      const { data } = await db.from("launchpad_tokens").select("mint_address").in("mint_address", [...new Set(all)]);
      const om = new Set(((data ?? []) as { mint_address: string }[]).map((r) => r.mint_address));
      for (const l of [fresh, stretch, migrated]) for (const t of l) if (om.has(t.mint)) t.dexId = "om";
    } catch { /* pas de base : on garde la plateforme d'origine */ }
  }
  return { fresh, stretch, migrated };
}
