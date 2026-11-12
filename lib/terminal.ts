/**
 * Terminal OM : listes de tokens Solana (tendance, nouveaux, recherche) depuis GeckoTerminal.
 * SOL et les stablecoins ne sont pas listés comme token à échanger.
 */
import { SOL_MINT, USDC_MINT } from "@/lib/swap/core";

export type TerminalToken = {
  mint: string; symbol: string; name: string; logo: string | null;
  price: number | null; change24h: number | null; volume24h: number | null; mcap: number | null; liquidity: number | null;
  pool: string; createdAt: string | null;
  /** chaîne du token (solana par défaut) ; href : page OM à ouvrir à la place du Terminal (tokens Arc) */
  chain?: TerminalChain; href?: string | null;
  /** vérifié par Jupiter (Solana) ou lancé sur OM : pastille bleue */
  verified?: boolean;
};

export type TerminalChain = "solana" | "arc" | "base" | "bnb" | "hyperliquid" | "ethereum" | "arbitrum" | "polygon" | "avalanche" | "elysium" | "robinhood";
/** Réseau GeckoTerminal de chaque chaîne (null : pas encore disponible) */
export const GT_NET: Record<TerminalChain, string | null> = { solana: "solana", base: "base", bnb: "bsc", hyperliquid: "hyperevm", ethereum: "eth", arbitrum: "arbitrum", polygon: "polygon_pos", avalanche: "avax", arc: null, elysium: "elysium", robinhood: "robinhood" };
/** Explorateurs des reseaux suivis dans le Terminal mais pas encore tradables (0x ne les gere pas) */
export const EXTRA_EXPLORERS: Partial<Record<TerminalChain, string>> = { robinhood: "https://robinhoodchain.blockscout.com" };
export const CHAINS: { id: TerminalChain; name: string; logo: string; ready: boolean }[] = [
  { id: "solana", name: "Solana", logo: "/chains/solana.png", ready: true },
  { id: "arc", name: "Arc", logo: "/chains/arc.png", ready: true },
  { id: "base", name: "Base", logo: "/chains/base.png", ready: true },
  { id: "bnb", name: "BNB", logo: "/chains/bnb.png", ready: true },
  { id: "hyperliquid", name: "Hyperliquid", logo: "/chains/hyperliquid.png", ready: true },
  { id: "ethereum", name: "Ethereum", logo: "/chains/ethereum.png", ready: true },
  { id: "arbitrum", name: "Arbitrum", logo: "/chains/arbitrum.png", ready: true },
  { id: "polygon", name: "Polygon", logo: "/chains/polygon.png", ready: true },
  { id: "avalanche", name: "Avalanche", logo: "/chains/avalanche.png", ready: true },
  { id: "elysium", name: "Elysium", logo: "/chains/elysium.png", ready: true },
  { id: "robinhood", name: "Robinhood", logo: "/chains/robinhood.png", ready: true },
];

const GT = "https://api.geckoterminal.com/api/v2";
const SKIP = new Set([SOL_MINT, USDC_MINT, "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  // Base / BNB : ETH, USDC, USDT, WBNB, BUSD… ne sont pas listés comme tokens à échanger
  "0x4200000000000000000000000000000000000006", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", "0x55d398326f99059ff775485246999027b3197955", "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", "0xe9e7cea3dcae0e3d40d4f4c7ac10f4b75d0d20e1",
]);

/** Adresses jamais listées comme token à échanger (SOL, USDC, USDT, natifs enveloppés...) */
export const isSkipped = (a: string) => SKIP.has(a) || SKIP.has(a.toLowerCase());

type GtPool = {
  attributes: {
    address: string; base_token_price_usd?: string | null; fdv_usd?: string | null; market_cap_usd?: string | null;
    reserve_in_usd?: string | null; pool_created_at?: string | null;
    price_change_percentage?: { h24?: string | null }; volume_usd?: { h24?: string | null };
  };
  relationships?: { base_token?: { data?: { id?: string } }; quote_token?: { data?: { id?: string } } };
};
type GtToken = { id: string; attributes: { address: string; name: string; symbol: string; image_url?: string | null } };

const num = (v: string | null | undefined) => { const n = Number(v); return v != null && Number.isFinite(n) ? n : null; };

export function mapPools(json: { data?: GtPool[]; included?: GtToken[] }, chain: TerminalChain = "solana"): TerminalToken[] {
  const toks = new Map((json.included ?? []).map((t) => [t.id, t.attributes]));
  const seen = new Set<string>();
  const out: TerminalToken[] = [];
  for (const p of json.data ?? []) {
    const base = toks.get(p.relationships?.base_token?.data?.id ?? "");
    if (!base || SKIP.has(base.address) || SKIP.has(base.address.toLowerCase()) || seen.has(base.address)) continue;
    seen.add(base.address);
    const a = p.attributes;
    const img = base.image_url && /^https:\/\//.test(base.image_url) && !/missing/.test(base.image_url) ? base.image_url : null;
    out.push({
      mint: base.address, symbol: base.symbol.slice(0, 16), name: base.name.slice(0, 40), logo: img,
      price: num(a.base_token_price_usd), change24h: num(a.price_change_percentage?.h24), volume24h: num(a.volume_usd?.h24),
      mcap: num(a.market_cap_usd) ?? num(a.fdv_usd), liquidity: num(a.reserve_in_usd), pool: a.address, createdAt: a.pool_created_at ?? null, chain,
    });
  }
  return out;
}

const cache = new Map<string, { at: number; v: TerminalToken[] }>();

export type ListKind = "trending" | "new" | "volume" | "crypto" | "search";
/** Onglet Crypto : seuil de capitalisation */
export const CRYPTO_MIN_MCAP = 50_000_000;
/** Réseaux tradables chez nous (Elysium et Robinhood : pas encore de swap) */
export const TRADABLE: TerminalChain[] = ["solana", "arc", "base", "bnb", "hyperliquid", "ethereum", "arbitrum", "polygon", "avalanche"];
const STABLE = /^(usd|dai$|fdusd|pyusd|usde|susde|eurc|tusd|busd|frax|lusd|gho)/i;
const SOL_USDC_POOL = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";

async function gtJson(url: string) {
  const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) throw new Error(`gecko ${r.status}`);
  return r.json();
}

/** Gros tokens d'un réseau : pools au plus gros volume (2 pages), capitalisation >= 50 M$. SOL en tête sur Solana. */
async function cryptoList(chain: TerminalChain, net: string): Promise<TerminalToken[]> {
  const pages = await Promise.all([
    gtJson(`${GT}/networks/${net}/pools?include=base_token&sort=h24_volume_usd_desc&page=1`),
    gtJson(`${GT}/networks/${net}/pools?include=base_token&sort=h24_volume_usd_desc&page=2`).catch(() => ({})),
  ]);
  const seen = new Set<string>();
  const out: TerminalToken[] = [];
  if (chain === "solana") {
    const sol = await gtJson(`${GT}/networks/solana/pools/${SOL_USDC_POOL}`).catch(() => null) as { data?: GtPool } | null;
    const a = sol?.data?.attributes;
    if (a) out.push({ mint: SOL_MINT, symbol: "SOL", name: "Solana", logo: "/chains/solana.png", price: num(a.base_token_price_usd), change24h: num(a.price_change_percentage?.h24), volume24h: num(a.volume_usd?.h24), mcap: num(a.market_cap_usd) ?? num(a.fdv_usd), liquidity: num(a.reserve_in_usd), pool: SOL_USDC_POOL, createdAt: null, chain, verified: true });
    seen.add(SOL_MINT);
  }
  for (const j of pages) for (const t of mapPools(j, chain)) {
    if (seen.has(t.mint) || (t.mcap ?? 0) < CRYPTO_MIN_MCAP || STABLE.test(t.symbol)) continue;
    seen.add(t.mint); out.push(t);
  }
  return out.sort((x, y) => (y.mcap ?? 0) - (x.mcap ?? 0));
}

export async function terminalList(kind: ListKind, q = "", chain: TerminalChain = "solana"): Promise<TerminalToken[]> {
  const net = GT_NET[chain];
  if (!net) return [];
  const key = `${chain}:${kind}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (kind === "crypto" ? 600_000 : 60_000)) return hit.v; // Crypto : 10 min (limite de GeckoTerminal)
  if (kind === "crypto") {
    if (!TRADABLE.includes(chain)) return [];
    const v = await cryptoList(chain, net);
    cache.set(key, { at: Date.now(), v });
    return v;
  }
  const url = kind === "trending" ? `${GT}/networks/${net}/trending_pools?include=base_token&duration=24h`
    : kind === "new" ? `${GT}/networks/${net}/new_pools?include=base_token`
    : kind === "volume" ? `${GT}/networks/${net}/pools?include=base_token&sort=h24_volume_usd_desc`
    : `${GT}/search/pools?network=${net}&include=base_token&query=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) throw new Error(`gecko ${r.status}`);
  let v = mapPools(await r.json(), chain);
  if (kind === "new") v = v.filter((t) => (t.liquidity ?? 0) >= 5000);
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  return v;
}

/** Recherche sur tous les réseaux en un seul appel GeckoTerminal (un appel par réseau dépassait leur limite). */
export async function searchAll(q: string, chains: TerminalChain[]): Promise<TerminalToken[]> {
  const key = `all:search:${chains.join(",")}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const j = await gtJson(`${GT}/search/pools?include=base_token&query=${encodeURIComponent(q)}`) as { data?: (GtPool & { id?: string; relationships?: { network?: { data?: { id?: string } } } })[]; included?: GtToken[] };
  const byNet = new Map<string, TerminalChain>();
  for (const c of chains) { const n = GT_NET[c]; if (n) byNet.set(n, c); }
  const groups = new Map<TerminalChain, GtPool[]>();
  for (const p of j.data ?? []) {
    const net = p.relationships?.network?.data?.id ?? (p.id ?? "").split("_")[0];
    const chain = byNet.get(net);
    if (!chain) continue;
    groups.set(chain, [...(groups.get(chain) ?? []), p]);
  }
  const v = [...groups.entries()].flatMap(([chain, data]) => mapPools({ data, included: j.included }, chain))
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
  cache.set(key, { at: Date.now(), v });
  return v;
}

/** Arc : les tokens lancés sur OM (pas encore suivis par GeckoTerminal). Chaque token ouvre sa page OM. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function arcList(db: any, kind: ListKind, q = ""): Promise<TerminalToken[]> {
  let qy = db.from("launchpad_tokens").select("id, name, ticker, logo_url, mint_address, price_usd, market_cap_usd, created_at")
    .eq("chain", "arc").eq("hidden", false).in("status", ["active", "graduating", "graduated"]).limit(50);
  if (kind === "crypto") qy = qy.gte("market_cap_usd", CRYPTO_MIN_MCAP);
  if (kind === "search" && q) qy = qy.or(`ticker.ilike.%${q.replace(/[^\w$-]/g, "")}%,name.ilike.%${q.replace(/[^\w $-]/g, "")}%`);
  qy = kind === "new" ? qy.order("created_at", { ascending: false }) : qy.order("market_cap_usd", { ascending: false, nullsFirst: false });
  const { data } = await qy;
  return ((data ?? []) as { id: string; name: string; ticker: string; logo_url: string | null; mint_address: string | null; price_usd: number | null; market_cap_usd: number | null; created_at: string }[])
    .filter((t) => t.mint_address)
    .map((t) => ({
      mint: t.mint_address as string, symbol: t.ticker.slice(0, 16), name: t.name.slice(0, 40), logo: t.logo_url,
      price: t.price_usd != null ? Number(t.price_usd) : null, change24h: null, volume24h: null,
      mcap: t.market_cap_usd != null ? Number(t.market_cap_usd) : null, liquidity: null, pool: "", createdAt: t.created_at,
      chain: "arc" as const, href: `/launchpad/${t.id}`,
    }));
}

/** Fusionne les listes de plusieurs réseaux : récents d'abord pour « new », plus gros volume pour « volume », sinon en alternance. */
export function mergeLists(lists: TerminalToken[][], kind: ListKind, max = 60): TerminalToken[] {
  if (kind === "crypto") return lists.flat().sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0)).slice(0, max);
  if (lists.length === 1) return lists[0].slice(0, max);
  if (kind === "new") return lists.flat().sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, max);
  if (kind === "volume") return lists.flat().sort((a, b) => (b.volume24h ?? -1) - (a.volume24h ?? -1)).slice(0, max);
  const out: TerminalToken[] = [];
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i] && out.length < max) out.push(l[i]);
  return out;
}
