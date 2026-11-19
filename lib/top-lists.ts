/**
 * Classements « Top 10 » à publier (admin seulement) :
 *  - source : « om » (Launchpad OM, toutes chaînes) ou une chaîne du Terminal (GeckoTerminal) ;
 *  - kind : capitalisation, volume, plus fortes hausses, plus fortes baisses, tokens vendus par l'équipe ;
 *  - period : jour, semaine, mois (volume, hausses, baisses).
 * Les hausses/baisses et volumes sur 7 ou 30 jours viennent des bougies journalières des pools (GeckoTerminal),
 * ou des trades connus d'OM pour les tokens du Launchpad.
 */
import { CHAINS, GT_NET, isSkipped, mapPools, type TerminalChain, type TerminalToken } from "@/lib/terminal";
import { analyzeDev } from "@/lib/terminal-dev";
import { loadTokenTrades } from "@/lib/trade-card";
import { refreshArcStats } from "@/lib/arc-stats";
import { stocksList } from "@/lib/terminal-stocks";

export type TopKind = "mcap" | "volume" | "gainers" | "losers" | "dev_sold";
export type TopPeriod = "day" | "week" | "month";
export type TopSource = "om" | "stocks" | TerminalChain;
export type TopRow = { name: string; symbol: string; logo: string | null; chain: string; mcap: number | null; value: number };

export const TOP_KINDS: TopKind[] = ["mcap", "volume", "gainers", "losers", "dev_sold"];
export const TOP_PERIODS: TopPeriod[] = ["day", "week", "month"];
/** Chaînes du Terminal disponibles (celles que GeckoTerminal couvre) */
export const TOP_CHAINS = CHAINS.filter((c) => GT_NET[c.id]).map((c) => c.id);
export const isSource = (s: string): s is TopSource => s === "om" || s === "stocks" || (TOP_CHAINS as string[]).includes(s);
/** Le classement par capitalisation et « vendus par l'équipe » n'ont pas de période */
export const hasPeriod = (k: TopKind) => k === "volume" || k === "gainers" || k === "losers";
/** « Vendus par l'équipe » : lecture des ventes du dev, possible sur Solana (et les tokens OM sur Solana) */
export const devSoldOk = (s: TopSource) => s === "om" || s === "solana";

const DAYS: Record<TopPeriod, number> = { day: 1, week: 7, month: 30 };
const GT = "https://api.geckoterminal.com/api/v2";
const STABLE = /usd|^eur|^(dai$|fdusd|pyusd|usde|susde|eurc|tusd|busd|frax|lusd|gho|w?eth$|w?btc|cbbtc|wbnb|wsol|weth)/i;

async function gt<T>(url: string): Promise<T | null> {
  // GeckoTerminal (gratuit) : environ 30 appels par minute ; en cas de refus (429), on attend puis on réessaie
  for (let k = 0; k < 4; k++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(9000), cache: "no-store" });
      if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 2000 * (k + 1))); continue; }
      return r.ok ? ((await r.json()) as T) : null;
    } catch { return null; }
  }
  return null;
}

/** Exécute `fn` sur la liste, `n` à la fois (GeckoTerminal limite le nombre d'appels par minute). */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

/** Tokens candidats d'une chaîne : plus gros volumes (2 pages) + tendances, sans stablecoins ni tokens trop petits. */
async function candidates(chain: TerminalChain): Promise<TerminalToken[]> {
  const net = GT_NET[chain];
  if (!net) return [];
  const pages = await Promise.all([
    gt(`${GT}/networks/${net}/pools?include=base_token&sort=h24_volume_usd_desc&page=1`),
    gt(`${GT}/networks/${net}/pools?include=base_token&sort=h24_volume_usd_desc&page=2`),
    gt(`${GT}/networks/${net}/trending_pools?include=base_token&duration=24h`),
  ]);
  const seen = new Set<string>();
  const out: TerminalToken[] = [];
  for (const j of pages) for (const t of mapPools((j ?? {}) as Parameters<typeof mapPools>[0], chain)) {
    if (seen.has(t.mint) || isSkipped(t.mint) || STABLE.test(t.symbol) || (t.liquidity ?? 0) < 10_000 || (t.mcap ?? 0) < 50_000) continue;
    seen.add(t.mint); out.push(t);
  }
  return out;
}

/** Bougies journalières d'une pool : [temps ms, ouverture, clôture, volume $], gardées 10 minutes. */
const candleCache = new Map<string, { at: number; v: [number, number, number, number][] }>();
async function daily(chain: TerminalChain, poolAddr: string): Promise<[number, number, number, number][]> {
  const key = `${chain}:${poolAddr}`;
  const hit = candleCache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.v;
  const j = await gt<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(`${GT}/networks/${GT_NET[chain]}/pools/${poolAddr}/ohlcv/day?aggregate=1&limit=31&currency=usd`);
  const v = (j?.data?.attributes?.ohlcv_list ?? []).map((c) => [c[0] * 1000, c[1], c[4], c[5]] as [number, number, number, number]).filter((c) => c[2] > 0).sort((a, b) => a[0] - b[0]);
  if (j) candleCache.set(key, { at: Date.now(), v });
  return v;
}

/** Variation (%) et volume ($) sur `days` jours, depuis les bougies journalières */
export function fromCandles(c: [number, number, number, number][], days: number, now = Date.now()): { change: number | null; volume: number } {
  if (!c.length) return { change: null, volume: 0 };
  const from = now - days * 86_400_000;
  const inside = c.filter((x) => x[0] >= from - 43_200_000);
  const ref = inside[0] ?? c[0];
  const last = c[c.length - 1][2];
  return { change: ref[1] > 0 ? (last / ref[1] - 1) * 100 : null, volume: inside.reduce((s, x) => s + x[3], 0) };
}

const row = (t: TerminalToken, value: number): TopRow => ({ name: t.name, symbol: t.symbol, logo: t.logo, chain: t.chain ?? "solana", mcap: t.mcap, value });

async function chainTop(chain: TerminalChain, kind: TopKind, period: TopPeriod): Promise<TopRow[]> {
  const list = await candidates(chain);
  const byVol = [...list].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
  if (kind === "mcap") return [...list].sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0)).slice(0, 10).map((t) => row(t, t.mcap ?? 0));
  if (kind === "dev_sold") {
    if (chain !== "solana") return [];
    const memes = byVol.filter((t) => (t.mcap ?? 0) < 50_000_000).slice(0, 30);
    const devs = await pool(memes, 4, (t) => analyzeDev(t.mint).catch(() => null));
    return memes.map((t, i) => ({ t, d: devs[i] }))
      .filter((x) => x.d && (x.d.status === "sold_all" || x.d.status === "selling") && x.d.soldPct > 0)
      .sort((a, b) => (b.d!.status === "sold_all" ? 1 : 0) - (a.d!.status === "sold_all" ? 1 : 0) || b.d!.soldPct - a.d!.soldPct)
      .slice(0, 10).map((x) => row(x.t, x.d!.status === "sold_all" ? 100 : x.d!.soldPct));
  }
  if (period === "day") {
    if (kind === "volume") return byVol.slice(0, 10).map((t) => row(t, t.volume24h ?? 0));
    const ch = list.filter((t) => t.change24h != null).sort((a, b) => (kind === "gainers" ? 1 : -1) * ((b.change24h ?? 0) - (a.change24h ?? 0)));
    return ch.filter((t) => (kind === "gainers" ? (t.change24h ?? 0) > 0 : (t.change24h ?? 0) < 0)).slice(0, 10).map((t) => row(t, t.change24h ?? 0));
  }
  // Semaine ou mois : bougies journalières des 30 tokens les plus échangés
  const pick = byVol.slice(0, 20);
  const stats = await pool(pick, 4, async (t) => fromCandles(await daily(chain, t.pool), DAYS[period]));
  const all = pick.map((t, i) => ({ t, s: stats[i] }));
  if (kind === "volume") return all.sort((a, b) => b.s.volume - a.s.volume).slice(0, 10).map((x) => row(x.t, x.s.volume));
  return all.filter((x) => x.s.change != null && (kind === "gainers" ? x.s.change > 0 : x.s.change < 0))
    .sort((a, b) => (kind === "gainers" ? 1 : -1) * ((b.s.change ?? 0) - (a.s.change ?? 0)))
    .slice(0, 10).map((x) => row(x.t, x.s.change ?? 0));
}

type Lt = { id: string; name: string; ticker: string; logo_url: string | null; chain: string | null; mint_address: string | null; creator_wallet: string | null; arc_launch_id: string | null; market_cap_usd: number | null; volume_24h_usd: number | null; price_usd: number | null };

type Live = { price: number | null; mcap: number | null; vol: number | null; pool: string | null };
/** Chiffres en direct des tokens Solana (GeckoTerminal, 30 adresses par appel) : prix, capitalisation (sinon FDV), volume 24 h, pool principale */
async function liveSolana(mints: string[]): Promise<Map<string, Live>> {
  const out = new Map<string, Live>();
  const n = (v?: string | null) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  for (let i = 0; i < mints.length; i += 30) {
    const j = await gt<{ data?: { attributes: { address: string; price_usd?: string | null; market_cap_usd?: string | null; fdv_usd?: string | null; volume_usd?: { h24?: string | null } }; relationships?: { top_pools?: { data?: { id: string }[] } } }[] }>(
      `${GT}/networks/solana/tokens/multi/${mints.slice(i, i + 30).join(",")}`);
    for (const d of j?.data ?? []) {
      const a = d.attributes;
      out.set(a.address, { price: n(a.price_usd), mcap: n(a.market_cap_usd) ?? n(a.fdv_usd), vol: n(a.volume_usd?.h24), pool: d.relationships?.top_pools?.data?.[0]?.id?.replace(/^solana_/, "") ?? null });
    }
  }
  return out;
}

/**
 * Launchpad OM (toutes chaînes). Chiffres pris au moment de la création : Solana en direct (GeckoTerminal),
 * Arc rafraîchi juste avant. Volume et variation sur la période : le plus complet entre les bougies de la pool
 * (tous les trades, y compris hors d'OM) et les trades passés par OM.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function omTop(db: any, kind: TopKind, period: TopPeriod, origin: string): Promise<TopRow[]> {
  // Arc : chiffres rafraîchis avant de lire (20 s au plus)
  await Promise.race([refreshArcStats(origin).catch(() => null), new Promise((ok) => setTimeout(ok, 20_000))]);
  const { data } = await db.from("launchpad_tokens")
    .select("id, name, ticker, logo_url, chain, mint_address, creator_wallet, arc_launch_id, market_cap_usd, volume_24h_usd, price_usd")
    .in("status", ["active", "graduating", "graduated"]).eq("is_tradeable", true).not("is_hidden", "is", true).not("mint_address", "is", null).limit(200);
  const all = (data ?? []) as Lt[];
  const live = await liveSolana(all.filter((t) => t.chain !== "arc").map((t) => t.mint_address!));
  for (const t of all) {
    const l = t.chain !== "arc" ? live.get(t.mint_address!) : null;
    if (!l) continue;
    if (l.price != null) t.price_usd = l.price;
    if (l.mcap != null) t.market_cap_usd = l.mcap;
    if (l.vol != null) t.volume_24h_usd = Math.max(l.vol, Number(t.volume_24h_usd ?? 0));
  }
  const toks = all.sort((a, b) => Number(b.market_cap_usd ?? 0) - Number(a.market_cap_usd ?? 0));
  const r = (t: Lt, value: number): TopRow => ({
    name: t.name, symbol: t.ticker.replace(/^\$+/, ""), logo: t.logo_url ? (t.logo_url.startsWith("/") ? origin + t.logo_url : t.logo_url) : null,
    chain: t.chain === "arc" ? "arc" : "solana", mcap: t.market_cap_usd != null ? Number(t.market_cap_usd) : null, value,
  });
  if (kind === "mcap") return toks.filter((t) => Number(t.market_cap_usd ?? 0) > 0).slice(0, 10).map((t) => r(t, Number(t.market_cap_usd)));
  if (kind === "dev_sold") {
    const sol = toks.filter((t) => t.chain !== "arc").slice(0, 30);
    const devs = await pool(sol, 4, (t) => analyzeDev(t.mint_address!, t.creator_wallet).catch(() => null));
    return sol.map((t, i) => ({ t, d: devs[i] })).filter((x) => x.d && (x.d.status === "sold_all" || x.d.status === "selling") && x.d.soldPct > 0)
      .sort((a, b) => b.d!.soldPct - a.d!.soldPct).slice(0, 10).map((x) => r(x.t, x.d!.status === "sold_all" ? 100 : x.d!.soldPct));
  }
  const from = Date.now() - DAYS[period] * 86_400_000;
  const stats = await pool(toks.slice(0, 40), 4, async (t) => {
    const tr = await loadTokenTrades(db, t.chain === "arc" ? "arc" : "solana", t.mint_address!, { id: t.id, chain: t.chain, arc_launch_id: t.arc_launch_id }, undefined, 2000).catch(() => []);
    let volume = tr.filter((x) => x.tsMs >= from).reduce((s, x) => s + x.usd, 0);
    const before = [...tr].reverse().find((x) => x.tsMs < from) ?? tr.find((x) => x.tsMs >= from);
    const p0 = before && before.tokens > 0 ? before.usd / before.tokens : 0;
    const p1 = Number(t.price_usd ?? 0);
    let change = p0 > 0 && p1 > 0 ? (p1 / p0 - 1) * 100 : null;
    if (period === "day") volume = Math.max(volume, Number(t.volume_24h_usd ?? 0));
    // Bougies de la pool (Solana) : comptent aussi les trades passés hors d'OM
    const poolAddr = t.chain !== "arc" ? live.get(t.mint_address!)?.pool : null;
    if (poolAddr && period !== "day") {
      const c = fromCandles(await daily("solana", poolAddr), DAYS[period]);
      volume = Math.max(volume, c.volume);
      if (c.change != null) change = c.change;
    }
    return { t, volume, change };
  });
  if (kind === "volume") return stats.filter((x) => x.volume > 0).sort((a, b) => b.volume - a.volume).slice(0, 10).map((x) => r(x.t, x.volume));
  return stats.filter((x) => x.change != null && (kind === "gainers" ? x.change > 0 : x.change < 0))
    .sort((a, b) => (kind === "gainers" ? 1 : -1) * ((b.change ?? 0) - (a.change ?? 0))).slice(0, 10).map((x) => r(x.t, x.change ?? 0));
}

/**
 * Actions tokenisées (Solana, émetteurs reconnus : xStocks, Ondo, Backpack). Jour : chiffres de Jupiter ;
 * semaine et mois : bougies journalières de la pool principale (GeckoTerminal) des 20 plus échangées.
 */
async function stocksTop(kind: TopKind, period: TopPeriod): Promise<TopRow[]> {
  const list = (await stocksList("")).filter((t) => (t.liquidity ?? 0) >= 1_000);
  const byVol = [...list].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
  if (kind === "mcap") return list.filter((t) => (t.mcap ?? 0) > 0).sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0)).slice(0, 10).map((t) => row(t, t.mcap ?? 0));
  if (kind === "dev_sold") return [];
  if (period === "day") {
    if (kind === "volume") return byVol.filter((t) => (t.volume24h ?? 0) > 0).slice(0, 10).map((t) => row(t, t.volume24h ?? 0));
    return list.filter((t) => t.change24h != null && (kind === "gainers" ? t.change24h > 0 : t.change24h < 0))
      .sort((a, b) => (kind === "gainers" ? 1 : -1) * ((b.change24h ?? 0) - (a.change24h ?? 0))).slice(0, 10).map((t) => row(t, t.change24h ?? 0));
  }
  const pick = byVol.slice(0, 20);
  const live = await liveSolana(pick.map((t) => t.mint));
  const stats = await pool(pick, 4, async (t) => {
    const p = live.get(t.mint)?.pool;
    return p ? fromCandles(await daily("solana", p), DAYS[period]) : { change: null, volume: 0 };
  });
  const all = pick.map((t, i) => ({ t, s: stats[i] }));
  if (kind === "volume") return all.filter((x) => x.s.volume > 0).sort((a, b) => b.s.volume - a.s.volume).slice(0, 10).map((x) => row(x.t, x.s.volume));
  return all.filter((x) => x.s.change != null && (kind === "gainers" ? x.s.change > 0 : x.s.change < 0))
    .sort((a, b) => (kind === "gainers" ? 1 : -1) * ((b.s.change ?? 0) - (a.s.change ?? 0)))
    .slice(0, 10).map((x) => row(x.t, x.s.change ?? 0));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildTop(db: any, source: TopSource, kind: TopKind, period: TopPeriod, origin: string): Promise<TopRow[]> {
  if (kind === "dev_sold" && !devSoldOk(source)) return [];
  return source === "om" ? omTop(db, kind, period, origin) : source === "stocks" ? stocksTop(kind, period) : chainTop(source, kind, period);
}
