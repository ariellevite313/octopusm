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
};

export type TerminalChain = "solana" | "arc" | "base" | "bnb" | "elysium" | "robinhood";
/** Réseau GeckoTerminal de chaque chaîne (null : pas encore disponible) */
export const GT_NET: Record<TerminalChain, string | null> = { solana: "solana", base: "base", bnb: "bsc", arc: null, elysium: null, robinhood: null };
export const CHAINS: { id: TerminalChain; name: string; logo: string; ready: boolean }[] = [
  { id: "solana", name: "Solana", logo: "/chains/solana.png", ready: true },
  { id: "arc", name: "Arc", logo: "/chains/arc.png", ready: true },
  { id: "base", name: "Base", logo: "/chains/base.png", ready: true },
  { id: "bnb", name: "BNB", logo: "/chains/bnb.png", ready: true },
  { id: "elysium", name: "Elysium", logo: "/chains/elysium.png", ready: false },
  { id: "robinhood", name: "Robinhood", logo: "/chains/robinhood.png", ready: false },
];

const GT = "https://api.geckoterminal.com/api/v2";
const SKIP = new Set([SOL_MINT, USDC_MINT, "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  // Base / BNB : ETH, USDC, USDT, WBNB, BUSD… ne sont pas listés comme tokens à échanger
  "0x4200000000000000000000000000000000000006", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", "0x55d398326f99059ff775485246999027b3197955", "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", "0xe9e7cea3dcae0e3d40d4f4c7ac10f4b75d0d20e1",
]);

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

export async function terminalList(kind: "trending" | "new" | "volume" | "search", q = "", chain: TerminalChain = "solana"): Promise<TerminalToken[]> {
  const net = GT_NET[chain];
  if (!net) return [];
  const key = `${chain}:${kind}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
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

/** Arc : les tokens lancés sur OM (pas encore suivis par GeckoTerminal). Chaque token ouvre sa page OM. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function arcList(db: any, kind: "trending" | "new" | "volume" | "search", q = ""): Promise<TerminalToken[]> {
  let qy = db.from("launchpad_tokens").select("id, name, ticker, logo_url, mint_address, price_usd, market_cap_usd, created_at")
    .eq("chain", "arc").in("status", ["active", "graduating", "graduated"]).limit(50);
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
