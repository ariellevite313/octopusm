/**
 * Onglet Crypto du Terminal : les grandes cryptos (capitalisation >= 50 M$) qu'on peut trader chez nous.
 * - CoinGecko : classement par capitalisation, logo, et l'adresse du token sur chacun de nos réseaux.
 * - Binance : prix et variation 24 h en direct pour celles qui y sont cotées (sinon le prix CoinGecko).
 * Un token n'est gardé que s'il a une adresse sur un réseau où nos swaps fonctionnent.
 * Clé facultative : COINGECKO_API_KEY (clé « demo » gratuite) pour des limites plus larges.
 */
import { SOL_MINT } from "@/lib/swap/core";
import type { TerminalChain, TerminalToken } from "@/lib/terminal";

const MIN_MCAP = 50_000_000;
const SOL_USDC_POOL = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";
/** Plateformes CoinGecko → nos réseaux (ordre = préférence quand un token existe sur plusieurs) */
const PLATFORMS: [string, TerminalChain][] = [
  ["solana", "solana"], ["base", "base"], ["ethereum", "ethereum"], ["binance-smart-chain", "bnb"],
  ["arbitrum-one", "arbitrum"], ["polygon-pos", "polygon"], ["avalanche", "avalanche"], ["hyperevm", "hyperliquid"],
];
const STABLE = /^(usd|dai$|fdusd|pyusd|usde|susde|eurc|eurt|tusd|busd|frax|lusd|gho|usdd|usds|rlusd)/i;
/** Jetons enveloppés du natif (ils servent de monnaie d'échange, on ne les liste pas) */
const WRAPPED_NATIVE = new Set(["weth", "wbnb", "wavax", "wpol", "wmatic", "whype", "wsol"]);

type CgMarket = { id: string; symbol: string; name: string; image: string | null; current_price: number | null; market_cap: number | null; total_volume: number | null; price_change_percentage_24h: number | null };
type CgCoin = { id: string; platforms?: Record<string, string> };

let platformsCache: { at: number; map: Map<string, Record<string, string>> } | null = null;
let marketsCache: { at: number; v: CgMarket[] } | null = null;
let binanceCache: { at: number; map: Map<string, { price: number; change: number; volume: number }> } | null = null;

function cgHeaders(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { accept: "application/json", "x-cg-demo-api-key": key } : { accept: "application/json" };
}

async function cg<T>(path: string, timeout = 12_000): Promise<T> {
  const r = await fetch(`https://api.coingecko.com/api/v3${path}`, { headers: cgHeaders(), signal: AbortSignal.timeout(timeout), cache: "no-store" });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  return r.json() as Promise<T>;
}

/** Adresses des tokens par réseau (liste complète, gardée 24 h en mémoire) */
async function platforms(): Promise<Map<string, Record<string, string>>> {
  if (platformsCache && Date.now() - platformsCache.at < 24 * 3600_000) return platformsCache.map;
  const list = await cg<CgCoin[]>("/coins/list?include_platform=true", 25_000);
  const map = new Map<string, Record<string, string>>();
  for (const c of list) if (c.platforms && Object.keys(c.platforms).length) map.set(c.id, c.platforms);
  platformsCache = { at: Date.now(), map };
  return map;
}

/** 500 plus grosses capitalisations (gardées 10 min) */
async function markets(): Promise<CgMarket[]> {
  if (marketsCache && Date.now() - marketsCache.at < 10 * 60_000) return marketsCache.v;
  const pages = await Promise.all([1, 2].map((p) => cg<CgMarket[]>(`/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${p}&price_change_percentage=24h`).catch(() => [] as CgMarket[])));
  const v = pages.flat();
  if (v.length) marketsCache = { at: Date.now(), v };
  return v.length ? v : marketsCache?.v ?? [];
}

/** Prix Binance en direct (paires USDT), gardés 1 min */
async function binance(): Promise<Map<string, { price: number; change: number; volume: number }>> {
  if (binanceCache && Date.now() - binanceCache.at < 60_000) return binanceCache.map;
  const map = new Map<string, { price: number; change: number; volume: number }>();
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/24hr?type=MINI", { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (r.ok) {
      for (const t of (await r.json()) as { symbol: string; lastPrice: string; openPrice: string; quoteVolume: string }[]) {
        if (!t.symbol.endsWith("USDT")) continue;
        const price = Number(t.lastPrice), open = Number(t.openPrice);
        if (price > 0) map.set(t.symbol.slice(0, -4), { price, change: open > 0 ? ((price - open) / open) * 100 : 0, volume: Number(t.quoteVolume) || 0 });
      }
    }
  } catch { /* Binance indisponible : prix CoinGecko */ }
  if (map.size) binanceCache = { at: Date.now(), map };
  return map.size ? map : binanceCache?.map ?? map;
}

export async function cryptoFromCoinGecko(chains: TerminalChain[], skip: (addr: string) => boolean): Promise<TerminalToken[]> {
  const [mk, plats, bn] = await Promise.all([markets(), platforms(), binance()]);
  if (!mk.length) return [];
  const allowed = PLATFORMS.filter(([, c]) => chains.includes(c));
  const out: TerminalToken[] = [];
  const seen = new Set<string>();
  for (const m of mk) {
    if ((m.market_cap ?? 0) < MIN_MCAP) continue;
    const sym = m.symbol.toUpperCase();
    if (STABLE.test(m.symbol) || WRAPPED_NATIVE.has(m.symbol.toLowerCase()) || (m.current_price && Math.abs(m.current_price - 1) < 0.02 && /usd|eur/i.test(m.name))) continue;
    let chain: TerminalChain | null = null, addr = "";
    if (m.id === "solana" && chains.includes("solana")) { chain = "solana"; addr = SOL_MINT; }
    else {
      const p = plats.get(m.id) ?? {};
      for (const [k, c] of allowed) {
        const a = (p[k] ?? "").trim();
        if (a && !skip(a)) { chain = c; addr = c === "solana" ? a : a.toLowerCase(); break; }
      }
    }
    if (!chain || !addr || seen.has(`${chain}:${addr}`)) continue;
    seen.add(`${chain}:${addr}`);
    const live = bn.get(sym);
    // Prix Binance seulement s'il est cohérent avec CoinGecko (même actif, pas un homonyme)
    const useLive = live && m.current_price && Math.abs(live.price - m.current_price) / m.current_price < 0.05;
    out.push({
      mint: addr, symbol: sym.slice(0, 16), name: m.name.slice(0, 40), logo: m.image && /^https:\/\//.test(m.image) ? m.image : null,
      price: useLive ? live!.price : m.current_price, change24h: useLive ? live!.change : m.price_change_percentage_24h,
      volume24h: m.total_volume, mcap: m.market_cap, liquidity: null,
      pool: m.id === "solana" ? SOL_USDC_POOL : "", createdAt: null, chain, verified: true,
    });
  }
  return out;
}

/** Capitalisation réelle d'une grande crypto (id CoinGecko, ex. « solana »). Null si CoinGecko ne répond pas. */
export async function coinMarketCap(id: string): Promise<number | null> {
  try {
    const hit = (await markets()).find((m) => m.id === id)?.market_cap;
    if (hit) return hit;
  } catch { /* repli ci-dessous */ }
  try {
    const j = await cg<Record<string, { usd_market_cap?: number }>>(`/simple/price?ids=${id}&vs_currencies=usd&include_market_cap=true`, 8000);
    return j[id]?.usd_market_cap ?? null;
  } catch { return null; }
}
