/**
 * DexScreener pour le Terminal : tendances (tokens boostés), nouveaux profils, recherche multi-réseaux,
 * et infos de profil (payé ou non, site web, réseaux sociaux). Toutes les réponses sont gardées en mémoire quelques minutes
 * (limites DexScreener : 60 requêtes/min pour boosts, profils et commandes ; 300/min pour pairs et recherche).
 */
import { isSkipped, type DexInfo, type TerminalChain, type TerminalToken } from "@/lib/terminal";

const API = "https://api.dexscreener.com";

/** Réseau DexScreener → réseau du Terminal */
export const DS_TO_CHAIN: Record<string, TerminalChain> = {
  solana: "solana", base: "base", bsc: "bnb", ethereum: "ethereum", arbitrum: "arbitrum", polygon: "polygon", avalanche: "avalanche", hyperevm: "hyperliquid",
};
export const CHAIN_TO_DS: Partial<Record<TerminalChain, string>> = Object.fromEntries(Object.entries(DS_TO_CHAIN).map(([k, v]) => [v, k]));

type DsLink = { type?: string; label?: string; url?: string };
export type DsPair = {
  chainId?: string; pairAddress?: string; baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string; priceChange?: { h24?: number }; volume?: { h24?: number }; liquidity?: { usd?: number };
  fdv?: number; marketCap?: number; pairCreatedAt?: number; boosts?: { active?: number };
  info?: { imageUrl?: string; header?: string; websites?: DsLink[]; socials?: DsLink[] };
};
type DsFeedItem = { chainId?: string; tokenAddress?: string; totalAmount?: number; amount?: number; links?: DsLink[] };
export type DsOrder = { type?: string; status?: string; paymentTimestamp?: number };

const cache = new Map<string, { at: number; v: unknown }>();
async function dsJson<T>(path: string, ttlMs: number): Promise<T | null> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T | null;
  let v: unknown = null;
  try {
    const r = await fetch(API + path, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (r.ok) v = await r.json();
  } catch { /* source indisponible : on garde null, les autres sources prennent le relais */ }
  // Un échec est gardé 30 s seulement pour ne pas marteler l'API
  cache.set(path, { at: v ? Date.now() : Date.now() - ttlMs + 30_000, v });
  if (cache.size > 600) cache.delete(cache.keys().next().value as string);
  return v as T | null;
}

const num = (v: unknown) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? n : null; };
const isUrl = (u?: string) => !!u && /^https?:\/\//i.test(u);

/** Profil DexScreener d'une paire : site web, réseaux sociaux, boosts actifs. */
export function dexInfoOf(pairs: DsPair[], forcePaid = false, boostFromFeed = 0): DexInfo {
  const withInfo = pairs.find((p) => p.info && (p.info.imageUrl || p.info.header || p.info.websites?.length || p.info.socials?.length));
  const info = withInfo?.info;
  const website = (info?.websites ?? []).map((w) => w.url).find(isUrl) ?? null;
  const socials = (info?.socials ?? []).filter((s) => isUrl(s.url) && s.type).map((s) => ({ type: String(s.type).toLowerCase(), url: s.url as string }));
  const boost = Math.max(boostFromFeed, ...pairs.map((p) => p.boosts?.active ?? 0));
  return { paid: forcePaid || !!info || boost > 0, boost, website, socials };
}

type Group = { chain: TerminalChain; address: string; pairs: DsPair[] };

/** Regroupe les paires par token (on ne garde que celles où le token est la base). */
function groupPairs(pairs: DsPair[]): Group[] {
  const groups = new Map<string, Group>();
  for (const p of pairs) {
    const chain = DS_TO_CHAIN[p.chainId ?? ""];
    const address = p.baseToken?.address;
    if (!chain || !address || !p.pairAddress || isSkipped(address)) continue;
    const key = `${chain}:${address.toLowerCase()}`;
    const g = groups.get(key) ?? { chain, address, pairs: [] };
    g.pairs.push(p);
    groups.set(key, g);
  }
  return [...groups.values()];
}

function toToken(g: Group, feed?: { boost: number }): TerminalToken {
  const best = [...g.pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const img = g.pairs.map((p) => p.info?.imageUrl).find((u) => u && /^https:\/\//.test(u)) ?? null;
  const volume = g.pairs.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0);
  return {
    mint: g.address, symbol: (best.baseToken?.symbol ?? "?").slice(0, 16), name: (best.baseToken?.name ?? best.baseToken?.symbol ?? "?").slice(0, 40), logo: img,
    price: num(best.priceUsd), change24h: num(best.priceChange?.h24), volume24h: volume || null, mcap: num(best.marketCap) ?? num(best.fdv),
    liquidity: num(best.liquidity?.usd), pool: best.pairAddress as string,
    createdAt: best.pairCreatedAt ? new Date(best.pairCreatedAt).toISOString() : null, chain: g.chain,
    dex: dexInfoOf(g.pairs, !!feed, feed?.boost ?? 0),
  };
}

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Paires de plusieurs tokens d'un même réseau (30 adresses par appel). */
async function pairsOf(ds: string, addresses: string[]): Promise<DsPair[]> {
  const out = await Promise.all(chunk(addresses, 30).map((c) => dsJson<DsPair[]>(`/tokens/v1/${ds}/${c.join(",")}`, 90_000)));
  return out.flatMap((x) => (Array.isArray(x) ? x : []));
}

/**
 * Tendances : tokens boostés (payés) les plus forts, puis boosts récents.
 * Nouveaux : derniers profils créés. Les autres tokens payés sont ainsi visibles même sans être dans GeckoTerminal.
 */
export async function dexList(kind: "trending" | "new", chains: TerminalChain[]): Promise<TerminalToken[]> {
  const allowed = new Set(chains.map((c) => CHAIN_TO_DS[c]).filter(Boolean) as string[]);
  const feeds = kind === "trending"
    ? await Promise.all([dsJson<DsFeedItem[]>("/token-boosts/top/v1", 120_000), dsJson<DsFeedItem[]>("/token-boosts/latest/v1", 120_000)])
    : [await dsJson<DsFeedItem[]>("/token-profiles/latest/v1", 120_000)];
  const order: { ds: string; address: string; boost: number }[] = [];
  const seen = new Set<string>();
  for (const f of feeds) for (const it of Array.isArray(f) ? f : []) {
    if (!it.chainId || !it.tokenAddress || !allowed.has(it.chainId)) continue;
    const k = `${it.chainId}:${it.tokenAddress.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    order.push({ ds: it.chainId, address: it.tokenAddress, boost: Math.round(it.totalAmount ?? it.amount ?? 0) });
    if (order.length >= 90) break;
  }
  const byChain = new Map<string, string[]>();
  for (const o of order) byChain.set(o.ds, [...(byChain.get(o.ds) ?? []), o.address]);
  const pairs = (await Promise.all([...byChain.entries()].map(([ds, a]) => pairsOf(ds, a)))).flat();
  const groups = new Map(groupPairs(pairs).map((g) => [`${g.chain}:${g.address.toLowerCase()}`, g]));
  const out: TerminalToken[] = [];
  for (const o of order) {
    const chain = DS_TO_CHAIN[o.ds];
    const g = groups.get(`${chain}:${o.address.toLowerCase()}`);
    if (!g) continue;
    const t = toToken(g, { boost: kind === "trending" ? o.boost : 0 });
    if ((t.liquidity ?? 0) < 2000) continue; // pas de pool réelle : rien à trader
    out.push(t);
  }
  return out;
}

/** Recherche sur tous les réseaux (nom, symbole ou adresse). */
export async function dexSearch(q: string, chains: TerminalChain[]): Promise<TerminalToken[]> {
  const allowed = new Set(chains);
  const j = await dsJson<{ pairs?: DsPair[] }>(`/latest/dex/search?q=${encodeURIComponent(q)}`, 60_000);
  return groupPairs(j?.pairs ?? [])
    .filter((g) => allowed.has(g.chain))
    .map((g) => toToken(g))
    .sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))
    .slice(0, 40);
}

/** Complète des fiches (capitalisation, liquidité, volume, logo) et ajoute le profil DexScreener à chaque token. */
export async function enrichDex(tokens: TerminalToken[]): Promise<void> {
  const need = tokens.filter((t) => !t.dex && !t.href && CHAIN_TO_DS[t.chain ?? "solana"]).slice(0, 150);
  const byChain = new Map<string, TerminalToken[]>();
  for (const t of need) { const ds = CHAIN_TO_DS[t.chain ?? "solana"] as string; byChain.set(ds, [...(byChain.get(ds) ?? []), t]); }
  await Promise.all([...byChain.entries()].map(async ([ds, list]) => {
    const groups = new Map(groupPairs(await pairsOf(ds, list.map((t) => t.mint))).map((g) => [g.address.toLowerCase(), g]));
    for (const t of list) {
      const g = groups.get(t.mint.toLowerCase());
      if (!g) continue;
      const d = toToken(g);
      t.dex = d.dex;
      t.logo = t.logo ?? d.logo; t.mcap = t.mcap ?? d.mcap; t.liquidity = t.liquidity ?? d.liquidity;
      t.volume24h = t.volume24h ?? d.volume24h; t.price = t.price ?? d.price; t.change24h = t.change24h ?? d.change24h;
    }
  }));
}

/** Vrai « Dex payé » : DexScreener a une commande de profil approuvée pour ce token. null si la vérification est impossible. */
export async function dexPaidCheck(chain: TerminalChain, address: string): Promise<boolean | null> {
  const ds = CHAIN_TO_DS[chain];
  if (!ds) return null;
  const orders = await dsJson<DsOrder[]>(`/orders/v1/${ds}/${address}`, 1_800_000);
  if (!Array.isArray(orders)) return null;
  return orders.some((o) => o.type === "tokenProfile" && o.status === "approved");
}
