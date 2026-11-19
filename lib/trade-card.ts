/**
 * Carte de partage d'un trade : l'historique d'achats / ventes d'un wallet sur un token, sa position et son gain.
 * Sources : token_trades (lancements OM Solana), arc_trades (lancements OM Arc) et swaps (Terminal, tokens externes).
 * Tout est public (activité on-chain) : n'importe qui peut partager la carte de n'importe quel wallet.
 */
import { createAdminClient } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/profiles";
import { loadTrades } from "@/lib/hackathon/ledger";
import { GT_NET, type TerminalChain } from "@/lib/terminal";

export const TERMINAL_CHAINS = Object.keys(GT_NET) as TerminalChain[];

export type CardTrade = { side: "buy" | "sell"; usd: number; tokens: number; tsMs: number };
export type TradeCard = {
  wallet: string; name: string; avatar: string | null;
  chain: "solana" | "arc"; mint: string; symbol: string; logo: string | null; verified: boolean;
  trades: CardTrade[];
  open: boolean; held: number; bought: number; sold: number; value: number; pnl: number; pct: number;
  price: number | null; mcap: number | null;
  series: { t: number; v: number }[]; // capitalisation (ou prix) dans le temps
  /** Vraies bougies de capitalisation du premier trade à maintenant (vide si la pool est inconnue) */
  candles: Candle[];
  lastAt: number;
};

const isEvm = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
/** Identifiant DexScreener de chaque réseau du Terminal */
const DS_ID: Partial<Record<TerminalChain, string>> = { solana: "solana", base: "base", bnb: "bsc", hyperliquid: "hyperevm", ethereum: "ethereum", arbitrum: "arbitrum", polygon: "polygon", avalanche: "avalanche" };
const USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wfGEPwvwyD1v";

type DsPair = { pairAddress?: string; priceUsd?: string; marketCap?: number; fdv?: number; liquidity?: { usd?: number }; baseToken?: { address?: string; symbol?: string }; info?: { imageUrl?: string } };

async function dsToken(chain: string, mint: string): Promise<{ price: number | null; mcap: number | null; symbol: string | null; logo: string | null; pool: string | null }> {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/${DS_ID[chain as TerminalChain] ?? chain}/${mint}`, { signal: AbortSignal.timeout(7000), next: { revalidate: 120 } });
    const j = (r.ok ? await r.json() : []) as DsPair[];
    const own = j.filter((p) => p.baseToken?.address?.toLowerCase() === mint.toLowerCase()).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const p = own[0];
    if (!p) return { price: null, mcap: null, symbol: null, logo: null, pool: null };
    return { price: Number(p.priceUsd) || null, mcap: (p.marketCap && p.marketCap > 0 ? p.marketCap : null) ?? (p.fdv && p.fdv > 0 ? p.fdv : null), symbol: p.baseToken?.symbol ?? null, logo: p.info?.imageUrl ?? null, pool: p.pairAddress ?? null };
  } catch { return { price: null, mcap: null, symbol: null, logo: null, pool: null }; }
}


/** GeckoTerminal limite les appels (429) : nouvel essai avec pause, et cache 10 min par adresse pour ne pas redemander les mêmes bougies */
const gtCache = new Map<string, { at: number; body: unknown }>();
async function gtJson<T>(url: string): Promise<T | null> {
  const hit = gtCache.get(url);
  if (hit && Date.now() - hit.at < 600_000) return hit.body as T;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (r.status === 429) { await new Promise((x) => setTimeout(x, 900 * (i + 1))); continue; }
      if (!r.ok) return null;
      const body = await r.json();
      gtCache.set(url, { at: Date.now(), body });
      if (gtCache.size > 400) gtCache.delete(gtCache.keys().next().value as string);
      return body as T;
    } catch { return null; }
  }
  return null;
}

/** Décimales d'un token (Solana : RPC ; Arc : decimals()). */
async function decimalsOf(chain: string, mint: string): Promise<number | null> {
  try {
    if (chain === "arc") {
      const r = await fetch("https://rpc.mainnet.arc.io", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: mint, data: "0x313ce567" }, "latest"] }), signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      return j?.result ? parseInt(j.result, 16) : null;
    }
    const url = process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [mint] }), signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    return typeof j?.result?.value?.decimals === "number" ? j.result.value.decimals : null;
  } catch { return null; }
}

/** Prix dans le temps (GeckoTerminal), du premier trade à maintenant. */
async function priceSeries(chain: string, pool: string | null, fromMs: number): Promise<{ t: number; v: number }[]> {
  if (!pool) return [];
  const span = Date.now() - fromMs;
  const [tf, agg] = span > 20 * 86_400_000 ? ["day", 1] : span > 3 * 86_400_000 ? ["hour", 4] : span > 6 * 3_600_000 ? ["hour", 1] : ["minute", 15];
  try {
    const j = await gtJson<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(`https://api.geckoterminal.com/api/v2/networks/${chain}/pools/${pool}/ohlcv/${tf}?aggregate=${agg}&limit=300&currency=usd`);
    if (!j) return [];
    return (j.data?.attributes?.ohlcv_list ?? []).map((c) => ({ t: c[0] * 1000, v: c[4] })).filter((p) => p.t >= fromMs - 3_600_000 && p.v > 0).sort((a, b) => a.t - b.t);
  } catch { return []; }
}

export type Candle = { t: number; o: number; h: number; l: number; c: number };

/** Bougies d'un token (GeckoTerminal), `count` bougies de `tf`/`agg`, du plus ancien au plus récent. */
async function candlesOf(net: string | null, pool: string | null, tf: "day" | "hour" | "minute", agg: number, count: number): Promise<Candle[]> {
  if (!net || !pool || !/^[A-Za-z0-9]{20,64}$/.test(pool)) return [];
  try {
    const j = await gtJson<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(`https://api.geckoterminal.com/api/v2/networks/${net}/pools/${pool}/ohlcv/${tf}?aggregate=${agg}&limit=${count}&currency=usd`);
    if (!j) return [];
    return (j.data?.attributes?.ohlcv_list ?? []).map((c) => ({ t: c[0] * 1000, o: c[1], h: c[2], l: c[3], c: c[4] })).filter((c) => c.c > 0 && c.h > 0).sort((a, b) => a.t - b.t);
  } catch { return []; }
}

/** Repli GeckoTerminal quand DexScreener ne connaît pas le token (pool récente, courbe de lancement) : prix, capitalisation, pool principale. */
async function gtToken(net: string | null, mint: string): Promise<{ price: number | null; mcap: number | null; symbol: string | null; name: string | null; logo: string | null; pool: string | null }> {
  const none = { price: null, mcap: null, symbol: null, name: null, logo: null, pool: null };
  if (!net) return none;
  try {
    const j = await gtJson<{ data?: { attributes?: Record<string, unknown>; relationships?: { top_pools?: { data?: { id: string }[] } } } }>(`https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${mint}?include=top_pools`);
    if (!j) return none;
    const a = j.data?.attributes ?? {};
    const n = (v: unknown) => { const x = Number(v); return v != null && v !== "" && Number.isFinite(x) && x > 0 ? x : null; };
    const poolId = j.data?.relationships?.top_pools?.data?.[0]?.id ?? null;
    const img = typeof a.image_url === "string" && a.image_url.startsWith("http") ? a.image_url : null;
    return { price: n(a.price_usd), mcap: n(a.market_cap_usd) ?? n(a.fdv_usd), symbol: typeof a.symbol === "string" ? a.symbol : null, name: typeof a.name === "string" ? a.name : null, logo: img, pool: poolId ? poolId.split("_").slice(1).join("_") : null };
  } catch { return none; }
}

type LaunchRef = { id: string; chain: string | null; arc_launch_id: string | null } | null;

/**
 * Achats et ventes d'un token connus d'OM (lancements OM + swaps passés par OM), du plus ancien au plus récent.
 * onlyWallet : un seul wallet (carte de partage) ; sinon tous les wallets (marqueurs sur le graphique), plafonné à `max`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadTokenTrades(db: any, chain: "solana" | "arc", mint: string, lt: LaunchRef, onlyWallet?: string, max = 2000): Promise<(CardTrade & { wallet: string })[]> {
  const out: (CardTrade & { wallet: string })[] = [];
  if (lt) {
    const l = await loadTrades(db, { id: lt.id, chain: lt.chain, arc_launch_id: lt.arc_launch_id }, onlyWallet).catch(() => []);
    for (const t of l.slice(-max)) out.push({ wallet: t.wallet, side: t.side, usd: t.usd, tokens: t.tokenAmount, tsMs: t.tsMs });
  }
  let q = db.from("swaps").select("wallet, side, in_amount, out_amount, volume_usd, created_at, input_mint, output_mint").eq("traded_mint", mint);
  if (onlyWallet) q = /^0x/i.test(onlyWallet) ? q.ilike("wallet", onlyWallet.replace(/[%_\\]/g, "")) : q.eq("wallet", onlyWallet);
  const { data: sw } = await q.order("created_at", { ascending: false }).limit(Math.min(max, 1000));
  if (sw?.length) {
    const dec = await decimalsOf(chain, mint);
    if (dec != null) {
      for (const s of sw as { wallet: string; side: "buy" | "sell"; in_amount: string; out_amount: string; volume_usd: number | null; created_at: string; input_mint: string; output_mint: string }[]) {
        const raw = Number(s.side === "buy" ? s.out_amount : s.in_amount);
        let usd = Number(s.volume_usd ?? 0);
        // Volume manquant : on le déduit de l'USDC échangé
        if (!usd && (s.input_mint === USDC_SOL || s.output_mint === USDC_SOL)) usd = Number(s.side === "buy" ? s.in_amount : s.out_amount) / 1e6;
        if (raw > 0 && usd > 0) out.push({ wallet: s.wallet, side: s.side, usd, tokens: raw / 10 ** dec, tsMs: Date.parse(s.created_at) });
      }
    }
  }
  return out.sort((a, b) => a.tsMs - b.tsMs).slice(-max);
}

export async function getTradeCard(walletIn: string, mint: string): Promise<TradeCard | null> {
  // Adresse valide uniquement : « % » ou « _ » feraient correspondre tous les wallets dans les filtres ilike
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletIn) && !/^0x[0-9a-fA-F]{40}$/.test(walletIn)) return null;
  const chain: "solana" | "arc" = isEvm(mint) ? "arc" : "solana";
  const wallet = isEvm(walletIn) ? walletIn.toLowerCase() : walletIn;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: lt } = await db.from("launchpad_tokens").select("id, chain, arc_launch_id, ticker, logo_url, price_usd, market_cap_usd").ilike("mint_address", mint).maybeSingle();
  const [ds, profiles] = await Promise.all([dsToken(chain, mint), getProfiles(db, [walletIn, wallet]).catch(() => new Map())]);
  const prof = profiles.get(walletIn) ?? profiles.get(wallet) ?? null;

  const trades: CardTrade[] = (await loadTokenTrades(db, chain, mint, lt, wallet)).map(({ wallet: _w, ...t }) => t);
  if (!trades.length) return null;
  trades.sort((a, b) => a.tsMs - b.tsMs);

  const bought = trades.filter((t) => t.side === "buy").reduce((s, t) => s + t.usd, 0);
  const sold = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.usd, 0);
  const net = trades.reduce((s, t) => s + (t.side === "buy" ? t.tokens : -t.tokens), 0);
  const held = Math.max(0, net);
  const price = ds.price ?? (lt?.price_usd != null ? Number(lt.price_usd) : null) ?? trades[trades.length - 1].usd / trades[trades.length - 1].tokens;
  const mcap = ds.mcap ?? (lt?.market_cap_usd != null ? Number(lt.market_cap_usd) : null);
  const value = held * (price ?? 0);
  const pnl = sold + value - bought;
  const pct = bought > 0 ? (pnl / bought) * 100 : 0;
  const open = held * (price ?? 0) >= 1; // moins d'un dollar restant : position fermée

  // Courbe : capitalisation si on la connaît (même forme que le prix), sinon prix ; repli sur les prix des trades
  let series = await priceSeries(chain, ds.pool, trades[0].tsMs);
  if (series.length < 2) series = trades.map((t) => ({ t: t.tsMs, v: t.usd / t.tokens })).concat(price ? [{ t: Date.now(), v: price }] : []);
  const k = mcap && price ? mcap / price : 1;
  series = series.map((p) => ({ t: p.t, v: p.v * k }));
  // Vraies bougies : unité choisie pour couvrir la position (un peu avant le premier trade) en 40 à 150 bougies
  const gtNet = chain === "arc" ? null : "solana"; // Arc : pas de bougies GeckoTerminal
  const span = Math.max(3_600_000, Date.now() - trades[0].tsMs) * 1.15;
  const [tf, agg, ms] = span <= 12 * 3_600_000 ? ["minute", 5, 300_000] as const : span <= 36 * 3_600_000 ? ["minute", 15, 900_000] as const
    : span <= 6 * 86_400_000 ? ["hour", 1, 3_600_000] as const : span <= 25 * 86_400_000 ? ["hour", 4, 14_400_000] as const : ["day", 1, 86_400_000] as const;
  const startMs = Date.now() - span;
  let candles = (await candlesOf(gtNet, ds.pool, tf, agg, Math.min(300, Math.ceil(span / ms) + 2))).filter((c) => c.t >= startMs - ms);
  candles = candles.map((c) => ({ t: c.t, o: c.o * k, h: c.h * k, l: c.l * k, c: c.c * k }));
  if (candles.length && mcap && price) { const c = candles[candles.length - 1]; c.c = mcap; c.h = Math.max(c.h, mcap); c.l = Math.min(c.l, mcap); }
  if (candles.length >= 6) series = candles.map((c) => ({ t: c.t, v: c.c }));

  return {
    wallet: walletIn, name: prof?.name ?? `${walletIn.slice(0, 4)}…${walletIn.slice(-4)}`, avatar: prof?.avatar_src ?? null,
    chain, mint, symbol: (lt?.ticker ?? ds.symbol ?? "TOKEN").replace(/^\$/, "").slice(0, 14), logo: lt?.logo_url ?? ds.logo, verified: !!lt,
    trades, open, held, bought, sold, value, pnl, pct, price, mcap: mcap && price ? mcap : null, series, candles, lastAt: trades[trades.length - 1].tsMs,
  };
}


export type TokenCard = {
  chain: TerminalChain; mint: string; symbol: string; name: string | null; logo: string | null; verified: boolean;
  mcap: number | null; price: number | null; series: { t: number; v: number }[];
  /** Vraies bougies (capitalisation) sur la période, si la pool est connue de GeckoTerminal */
  candles: Candle[];
  change: number; pct: number | null; marks: { t: number; side: "buy" | "sell" }[];
};

/**
 * Carte de partage d'un token sans trade du wallet (Terminal) : vraies bougies de capitalisation sur 30 jours, achats et ventes
 * passés par OM en marqueurs, variation de la capitalisation sur la période. Tous les réseaux du Terminal.
 * `chain` : réseau du token (sinon Solana, ou Arc pour une adresse 0x) ; `poolHint` : pool connue du Terminal.
 */
export async function getTokenCard(mint: string, chainIn?: string | null, poolHint?: string | null): Promise<TokenCard | null> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) && !isEvm(mint)) return null;
  const chain: TerminalChain = chainIn && (TERMINAL_CHAINS as string[]).includes(chainIn) ? (chainIn as TerminalChain) : isEvm(mint) ? "arc" : "solana";
  const net = GT_NET[chain];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const ourChain = chain === "solana" || chain === "arc";
  const [{ data: lt }, ds, gt] = await Promise.all([
    ourChain ? db.from("launchpad_tokens").select("id, chain, arc_launch_id, name, ticker, logo_url, price_usd, market_cap_usd").ilike("mint_address", mint).maybeSingle() : Promise.resolve({ data: null }),
    dsToken(chain, mint),
    gtToken(net, mint),
  ]);
  const pool = ds.pool ?? gt.pool ?? (poolHint && /^[A-Za-z0-9]{20,64}$/.test(poolHint) ? poolHint : null);
  if (!lt && !pool && !gt.price) return null;
  const price = ds.price ?? gt.price ?? (lt?.price_usd != null ? Number(lt.price_usd) : null);
  const mcap = ds.mcap ?? gt.mcap ?? (lt?.market_cap_usd != null ? Number(lt.market_cap_usd) : null);
  const from = Date.now() - 30 * 86_400_000;
  // Bougies de 12 h sur 30 jours ; si la pool est plus récente, des bougies plus fines pour que le graphique ait de la matière
  let candles = await candlesOf(net, pool, "hour", 12, 60);
  if (candles.length < 12) {
    const fine = await candlesOf(net, pool, "hour", 1, 168);
    if (fine.length > candles.length) candles = fine;
    if (candles.length < 12) { const m = await candlesOf(net, pool, "minute", 15, 192); if (m.length > candles.length) candles = m; }
  }
  const k = mcap && price ? mcap / price : 1;
  candles = candles.map((c) => ({ t: c.t, o: c.o * k, h: c.h * k, l: c.l * k, c: c.c * k }));
  // Dernière bougie recalée sur la capitalisation actuelle
  if (candles.length && mcap) { const c = candles[candles.length - 1]; c.c = mcap; c.h = Math.max(c.h, mcap); c.l = Math.min(c.l, mcap); }
  let series = candles.map((c) => ({ t: c.t, v: c.c }));
  if (series.length < 2 && mcap) series = [{ t: from, v: mcap }, { t: Date.now(), v: mcap }];
  const first = candles[0]?.o ?? series[0]?.v ?? 0, last = mcap ?? series[series.length - 1]?.v ?? 0;
  const trades = ourChain ? await loadTokenTrades(db, chain as "solana" | "arc", mint, lt, undefined, 80).catch(() => []) : [];
  const t0 = candles[0]?.t ?? series[0]?.t ?? from;
  return {
    chain, mint, symbol: (lt?.ticker ?? ds.symbol ?? gt.symbol ?? "TOKEN").replace(/^\$/, "").slice(0, 14), name: lt?.name ?? gt.name ?? null,
    logo: lt?.logo_url ?? ds.logo ?? gt.logo, verified: !!lt, mcap, price, series, candles,
    change: last - first, pct: first > 0 ? ((last - first) / first) * 100 : null,
    marks: trades.filter((t) => t.tsMs >= t0).map((t) => ({ t: t.tsMs, side: t.side })),
  };
}
