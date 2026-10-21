/**
 * Prix en temps réel d'une crypto (côté navigateur) : grandes cryptos via les paires USDT, sinon la paire DEX
 * la plus liquide. Les sources ne sont jamais affichées.
 */
export type Range = "1H" | "1D" | "1W" | "ALL";
export type LiveQuote = {
  symbol: string;
  name: string;
  logo: string | null;
  price: number;
  change24h: number;
  kind: "cex" | "dex";
  /** Pour les paires DEX : réseau + adresse du pool (graphique) */
  pool?: { network: string; address: string };
};

const LOCAL_LOGO: Record<string, string> = { BTC: "/bitcoin.png", ETH: "/ethereum.png", BNB: "/bnb.png", DOGE: "/doge.png", SOL: "/solana.png", PEPE: "/pepe.png", USDC: "/usdc-coin.png" };
const NAMES: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB", XRP: "XRP", DOGE: "Dogecoin", ADA: "Cardano", AVAX: "Avalanche", LINK: "Chainlink",
  TON: "Toncoin", SUI: "Sui", PEPE: "Pepe", SHIB: "Shiba Inu", TRX: "TRON", DOT: "Polkadot", LTC: "Litecoin", BCH: "Bitcoin Cash", NEAR: "NEAR",
  APT: "Aptos", ARB: "Arbitrum", OP: "Optimism", WIF: "dogwifhat", BONK: "Bonk", HYPE: "Hyperliquid", UNI: "Uniswap", ATOM: "Cosmos", XLM: "Stellar",
};
const STABLES = new Set(["USDT", "USDC", "DAI", "FDUSD", "USDE"]);
const GT_NETWORK: Record<string, string> = { solana: "solana", ethereum: "eth", bsc: "bsc", base: "base", arbitrum: "arbitrum", polygon: "polygon_pos", avalanche: "avax", optimism: "optimism" };

const BINANCE = "https://api.binance.com/api/v3";
const cache = new Map<string, { at: number; q: LiveQuote | null }>();

export async function resolveQuote(raw: string): Promise<LiveQuote | null> {
  const symbol = raw.replace(/^\$/, "").replace(/USDT$/i, "").toUpperCase();
  if (!symbol || STABLES.has(symbol)) return null;
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < 15_000) return hit.q;
  let q: LiveQuote | null = null;
  try {
    const r = await fetch(`${BINANCE}/ticker/24hr?symbol=${symbol}USDT`);
    if (r.ok) {
      const j = (await r.json()) as { lastPrice: string; priceChangePercent: string };
      const price = Number(j.lastPrice);
      if (Number.isFinite(price) && price > 0) q = { symbol, name: NAMES[symbol] ?? symbol, logo: LOCAL_LOGO[symbol] ?? null, price, change24h: Number(j.priceChangePercent) || 0, kind: "cex" };
    }
  } catch { /* indisponible : on tente la paire DEX */ }
  if (!q) {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`);
      const j = (await r.json()) as { pairs?: { chainId: string; pairAddress: string; baseToken: { symbol: string; name: string }; priceUsd?: string; priceChange?: { h24?: number }; liquidity?: { usd?: number }; info?: { imageUrl?: string } }[] };
      const best = (j.pairs ?? [])
        .filter((p) => p.baseToken.symbol.toUpperCase() === symbol && p.priceUsd && (p.liquidity?.usd ?? 0) > 10_000)
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
      if (best) {
        q = {
          symbol, name: best.baseToken.name, logo: best.info?.imageUrl ?? LOCAL_LOGO[symbol] ?? null, price: Number(best.priceUsd), change24h: Number(best.priceChange?.h24 ?? 0), kind: "dex",
          pool: GT_NETWORK[best.chainId] ? { network: GT_NETWORK[best.chainId], address: best.pairAddress } : undefined,
        };
      }
    } catch { /* rien */ }
  }
  cache.set(symbol, { at: Date.now(), q });
  return q;
}

const CEX_RANGE: Record<Range, [string, number]> = { "1H": ["1m", 60], "1D": ["15m", 96], "1W": ["2h", 84], ALL: ["1d", 365] };
const DEX_RANGE: Record<Range, [string, number, number]> = { "1H": ["minute", 1, 60], "1D": ["minute", 15, 96], "1W": ["hour", 2, 84], ALL: ["day", 1, 365] };

export async function loadSeries(q: LiveQuote, range: Range): Promise<number[]> {
  try {
    if (q.kind === "cex") {
      const [iv, limit] = CEX_RANGE[range];
      const r = await fetch(`${BINANCE}/klines?symbol=${q.symbol}USDT&interval=${iv}&limit=${limit}`);
      const rows = (await r.json()) as string[][];
      return Array.isArray(rows) ? rows.map((k) => Number(k[4])).filter((v) => Number.isFinite(v)) : [];
    }
    if (!q.pool) return [];
    const [tf, agg, limit] = DEX_RANGE[range];
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${q.pool.network}/pools/${q.pool.address}/ohlcv/${tf}?aggregate=${agg}&limit=${limit}`);
    const j = (await r.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
    return (j.data?.attributes?.ohlcv_list ?? []).map((c) => c[4]).reverse();
  } catch { return []; }
}

/** Abonnement au prix en continu pour les grandes cryptos (WebSocket), sinon rafraîchissement toutes les 20 s. */
export function subscribePrice(q: LiveQuote, onPrice: (price: number, change24h: number) => void): () => void {
  if (q.kind === "cex" && typeof WebSocket !== "undefined") {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${q.symbol.toLowerCase()}usdt@miniTicker`);
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data as string) as { c: string; o: string };
          const c = Number(m.c), o = Number(m.o);
          if (c > 0) onPrice(c, o > 0 ? ((c - o) / o) * 100 : q.change24h);
        } catch { /* message ignoré */ }
      };
    } catch { /* pas de flux : prix figé */ }
    return () => { try { ws?.close(); } catch { /* déjà fermé */ } };
  }
  const t = setInterval(async () => {
    cache.delete(q.symbol);
    const n = await resolveQuote(q.symbol);
    if (n) onPrice(n.price, n.change24h);
  }, 20_000);
  return () => clearInterval(t);
}

export function fmtUsd(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 }).replace(/,/g, " ")}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}
