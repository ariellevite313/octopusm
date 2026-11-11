/**
 * Terminal OM : listes de tokens Solana (tendance, nouveaux, recherche) depuis GeckoTerminal.
 * SOL et les stablecoins ne sont pas listés comme token à échanger.
 */
import { SOL_MINT, USDC_MINT } from "@/lib/swap/core";

export type TerminalToken = {
  mint: string; symbol: string; name: string; logo: string | null;
  price: number | null; change24h: number | null; volume24h: number | null; mcap: number | null; liquidity: number | null;
  pool: string; createdAt: string | null;
};

const GT = "https://api.geckoterminal.com/api/v2";
const SKIP = new Set([SOL_MINT, USDC_MINT, "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);

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

export function mapPools(json: { data?: GtPool[]; included?: GtToken[] }): TerminalToken[] {
  const toks = new Map((json.included ?? []).map((t) => [t.id, t.attributes]));
  const seen = new Set<string>();
  const out: TerminalToken[] = [];
  for (const p of json.data ?? []) {
    const base = toks.get(p.relationships?.base_token?.data?.id ?? "");
    if (!base || SKIP.has(base.address) || seen.has(base.address)) continue;
    seen.add(base.address);
    const a = p.attributes;
    const img = base.image_url && /^https:\/\//.test(base.image_url) && !/missing/.test(base.image_url) ? base.image_url : null;
    out.push({
      mint: base.address, symbol: base.symbol.slice(0, 16), name: base.name.slice(0, 40), logo: img,
      price: num(a.base_token_price_usd), change24h: num(a.price_change_percentage?.h24), volume24h: num(a.volume_usd?.h24),
      mcap: num(a.market_cap_usd) ?? num(a.fdv_usd), liquidity: num(a.reserve_in_usd), pool: a.address, createdAt: a.pool_created_at ?? null,
    });
  }
  return out;
}

const cache = new Map<string, { at: number; v: TerminalToken[] }>();

export async function terminalList(kind: "trending" | "new" | "volume" | "search", q = ""): Promise<TerminalToken[]> {
  const key = `${kind}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const url = kind === "trending" ? `${GT}/networks/solana/trending_pools?include=base_token&duration=24h`
    : kind === "new" ? `${GT}/networks/solana/new_pools?include=base_token`
    : kind === "volume" ? `${GT}/networks/solana/pools?include=base_token&sort=h24_volume_usd_desc`
    : `${GT}/search/pools?network=solana&include=base_token&query=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) throw new Error(`gecko ${r.status}`);
  let v = mapPools(await r.json());
  if (kind === "new") v = v.filter((t) => (t.liquidity ?? 0) >= 5000);
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  return v;
}
