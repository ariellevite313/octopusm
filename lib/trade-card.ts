/**
 * Carte de partage d'un trade : l'historique d'achats / ventes d'un wallet sur un token, sa position et son gain.
 * Sources : token_trades (lancements OM Solana), arc_trades (lancements OM Arc) et swaps (Terminal, tokens externes).
 * Tout est public (activité on-chain) : n'importe qui peut partager la carte de n'importe quel wallet.
 */
import { createAdminClient } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/profiles";
import { loadTrades } from "@/lib/hackathon/ledger";

export type CardTrade = { side: "buy" | "sell"; usd: number; tokens: number; tsMs: number };
export type TradeCard = {
  wallet: string; name: string; avatar: string | null;
  chain: "solana" | "arc"; mint: string; symbol: string; logo: string | null; verified: boolean;
  trades: CardTrade[];
  open: boolean; held: number; bought: number; sold: number; value: number; pnl: number; pct: number;
  price: number | null; mcap: number | null;
  series: { t: number; v: number }[]; // capitalisation (ou prix) dans le temps
  lastAt: number;
};

const isEvm = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
const USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wfGEPwvwyD1v";

type DsPair = { pairAddress?: string; priceUsd?: string; marketCap?: number; fdv?: number; liquidity?: { usd?: number }; baseToken?: { address?: string; symbol?: string }; info?: { imageUrl?: string } };

async function dsToken(chain: string, mint: string): Promise<{ price: number | null; mcap: number | null; symbol: string | null; logo: string | null; pool: string | null }> {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${mint}`, { signal: AbortSignal.timeout(7000), next: { revalidate: 120 } });
    const j = (r.ok ? await r.json() : []) as DsPair[];
    const own = j.filter((p) => p.baseToken?.address?.toLowerCase() === mint.toLowerCase()).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const p = own[0];
    if (!p) return { price: null, mcap: null, symbol: null, logo: null, pool: null };
    return { price: Number(p.priceUsd) || null, mcap: p.marketCap ?? p.fdv ?? null, symbol: p.baseToken?.symbol ?? null, logo: p.info?.imageUrl ?? null, pool: p.pairAddress ?? null };
  } catch { return { price: null, mcap: null, symbol: null, logo: null, pool: null }; }
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
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${chain}/pools/${pool}/ohlcv/${tf}?aggregate=${agg}&limit=300&currency=usd`, { signal: AbortSignal.timeout(7000), next: { revalidate: 300 } });
    if (!r.ok) return [];
    const j = await r.json() as { data?: { attributes?: { ohlcv_list?: number[][] } } };
    return (j.data?.attributes?.ohlcv_list ?? []).map((c) => ({ t: c[0] * 1000, v: c[4] })).filter((p) => p.t >= fromMs - 3_600_000 && p.v > 0).sort((a, b) => a.t - b.t);
  } catch { return []; }
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

  return {
    wallet: walletIn, name: prof?.name ?? `${walletIn.slice(0, 4)}…${walletIn.slice(-4)}`, avatar: prof?.avatar_src ?? null,
    chain, mint, symbol: (lt?.ticker ?? ds.symbol ?? "TOKEN").replace(/^\$/, "").slice(0, 14), logo: lt?.logo_url ?? ds.logo, verified: !!lt,
    trades, open, held, bought, sold, value, pnl, pct, price, mcap: mcap && price ? mcap : null, series, lastAt: trades[trades.length - 1].tsMs,
  };
}


export type TokenCard = {
  chain: "solana" | "arc"; mint: string; symbol: string; name: string | null; logo: string | null; verified: boolean;
  mcap: number | null; price: number | null; series: { t: number; v: number }[];
  change: number; pct: number | null; marks: { t: number; side: "buy" | "sell" }[];
};

/**
 * Carte de partage d'un token sans trade du wallet (Terminal) : capitalisation sur 30 jours, achats et ventes passés par OM
 * en marqueurs, variation de la capitalisation sur la période.
 */
export async function getTokenCard(mint: string): Promise<TokenCard | null> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) && !isEvm(mint)) return null;
  const chain: "solana" | "arc" = isEvm(mint) ? "arc" : "solana";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [{ data: lt }, ds] = await Promise.all([
    db.from("launchpad_tokens").select("id, chain, arc_launch_id, name, ticker, logo_url, price_usd, market_cap_usd").ilike("mint_address", mint).maybeSingle(),
    dsToken(chain, mint),
  ]);
  if (!lt && !ds.pool) return null;
  const price = ds.price ?? (lt?.price_usd != null ? Number(lt.price_usd) : null);
  const mcap = ds.mcap ?? (lt?.market_cap_usd != null ? Number(lt.market_cap_usd) : null);
  const from = Date.now() - 30 * 86_400_000;
  let series = await priceSeries(chain, ds.pool, from);
  const k = mcap && price ? mcap / price : 1;
  series = series.map((p) => ({ t: p.t, v: p.v * k }));
  if (series.length < 2 && mcap) series = [{ t: from, v: mcap }, { t: Date.now(), v: mcap }];
  const first = series[0]?.v ?? 0, last = mcap ?? series[series.length - 1]?.v ?? 0;
  const trades = await loadTokenTrades(db, chain, mint, lt, undefined, 80).catch(() => []);
  return {
    chain, mint, symbol: (lt?.ticker ?? ds.symbol ?? "TOKEN").replace(/^\$/, "").slice(0, 14), name: lt?.name ?? null,
    logo: lt?.logo_url ?? ds.logo, verified: !!lt, mcap, price, series,
    change: last - first, pct: first > 0 ? ((last - first) / first) * 100 : null,
    marks: trades.filter((t) => t.tsMs >= (series[0]?.t ?? from)).map((t) => ({ t: t.tsMs, side: t.side })),
  };
}
