/**
 * Données de la carte token d'une publication : graphe (1H/1D/1W/ALL), montant détenu et bénéfice du wallet.
 * Sources : GeckoTerminal (Solana), événements Trade (Arc), RPC (soldes / historique). Cache mémoire 3 min.
 * Le bénéfice n'est renvoyé que s'il est calculable de façon fiable ; sinon null (l'UI le masque).
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { GET as arcTrades } from "@/app/api/launchpad/arc-trades/route";

export type Range = "1H" | "1D" | "1W" | "ALL";
export type Series = Record<Range, number[]>;
export type TokenCard = {
  token: { id: string; name: string; ticker: string; logo_url: string | null; chain: "solana" | "arc"; market_cap_usd: number | null; mint_address: string | null };
  series: Series;
  price_usd: number | null;
  holds_usd: number | null;
  profit_usd: number | null;
  return_pct: number | null;
};

const TTL = 3 * 60_000;
const cache = new Map<string, { at: number; v: TokenCard | null }>();
const RPC = process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const GT = "https://api.geckoterminal.com/api/v2/networks/solana";

async function gt(path: string): Promise<unknown> {
  const r = await fetch(`${GT}${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(7000) });
  return r.ok ? r.json() : null;
}

async function ohlcv(pool: string, tf: "minute" | "hour" | "day", agg: number, limit: number): Promise<number[]> {
  const j = (await gt(`/pools/${pool}/ohlcv/${tf}?aggregate=${agg}&limit=${limit}&currency=usd`)) as
    | { data?: { attributes?: { ohlcv_list?: number[][] } } } | null;
  return (j?.data?.attributes?.ohlcv_list ?? []).slice().reverse().map((k) => Number(k[4])).filter((n) => n > 0);
}

async function solanaSeries(pool: string | null, mint: string | null): Promise<Series> {
  let addr = pool;
  if (!addr && mint) {
    const j = (await gt(`/tokens/${mint}/pools?page=1`)) as { data?: { attributes?: { address?: string } }[] } | null;
    addr = j?.data?.[0]?.attributes?.address ?? null;
  }
  if (!addr) return { "1H": [], "1D": [], "1W": [], ALL: [] };
  const [h, d, w, a] = await Promise.all([ohlcv(addr, "minute", 5, 12), ohlcv(addr, "hour", 1, 24), ohlcv(addr, "hour", 1, 168), ohlcv(addr, "day", 1, 90)]);
  return { "1H": h, "1D": d, "1W": w, ALL: a };
}

type ArcTrade = { timestamp: number; isBuy: boolean; trader: string; usdcAmt: number; tokenAmt: number; price: number };

async function arcTradeList(origin: string, curve: string): Promise<ArcTrade[]> {
  const res = await arcTrades(new Request(`${origin}/api/launchpad/arc-trades?curveAddress=${curve}&limit=1000`));
  if (!res.ok) return [];
  return ((await res.json()) as { trades?: ArcTrade[] }).trades ?? [];
}

function arcSeries(trades: ArcTrade[]): Series {
  const now = Math.floor(Date.now() / 1000);
  const pick = (secs: number) => trades.filter((t) => t.timestamp >= now - secs).map((t) => t.price);
  const all = trades.map((t) => t.price);
  const clip = (a: number[]) => (a.length > 60 ? a.filter((_, i) => i % Math.ceil(a.length / 60) === 0) : a);
  return { "1H": clip(pick(3600)), "1D": clip(pick(86400)), "1W": clip(pick(604800)), ALL: clip(all) };
}

async function solPriceUsd(): Promise<number> {
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", { signal: AbortSignal.timeout(4000) });
    return Number(((await r.json()) as { data?: { amount?: string } }).data?.amount) || 0;
  } catch { return 0; }
}

/** Solana : solde du wallet + coût / produit des 100 dernières transactions du compte token. */
async function solanaPosition(wallet: string, mint: string, price: number) {
  const conn = new Connection(RPC, "confirmed");
  const owner = new PublicKey(wallet);
  const mintPk = new PublicKey(mint);
  const accs = await conn.getTokenAccountsByOwner(owner, { mint: mintPk }, "confirmed");
  if (accs.value.length === 0) return { holds: 0, profit: null as number | null, basis: 0 };
  const bal = await conn.getTokenAccountBalance(accs.value[0].pubkey);
  const holdTokens = Number(bal.value.uiAmountString ?? bal.value.uiAmount ?? 0);
  const holds = holdTokens * price;

  const sigs = await conn.getSignaturesForAddress(accs.value[0].pubkey, { limit: 100 });
  if (sigs.length >= 100) return { holds, profit: null, basis: 0 }; // historique incomplet : pas de bénéfice affiché
  const txs = await conn.getParsedTransactions(sigs.map((s) => s.signature), { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  let solIn = 0, solOut = 0;
  for (const tx of txs) {
    if (!tx?.meta || tx.meta.err) continue;
    const keys = tx.transaction.message.accountKeys;
    const idx = keys.findIndex((k) => k.pubkey.toBase58() === wallet);
    if (idx < 0) continue;
    const sum = (arr?: { owner?: string; mint: string; uiTokenAmount: { uiAmount: number | null } }[] | null) =>
      (arr ?? []).filter((b) => b.owner === wallet && b.mint === mint).reduce((s, b) => s + (b.uiTokenAmount.uiAmount ?? 0), 0);
    const dTok = sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances);
    const fee = idx === 0 ? tx.meta.fee : 0;
    const dSol = (tx.meta.postBalances[idx] - tx.meta.preBalances[idx] + fee) / 1e9;
    if (dTok > 0 && dSol < 0) solOut += -dSol;
    else if (dTok < 0 && dSol > 0) solIn += dSol;
  }
  const sp = await solPriceUsd();
  if (!sp || solOut === 0) return { holds, profit: null, basis: 0 };
  const basis = solOut * sp;
  return { holds, profit: holds + solIn * sp - basis, basis };
}

export async function getTokenCard(origin: string, ticker: string, wallet: string | null): Promise<TokenCard | null> {
  const key = `${ticker.toLowerCase()}:${wallet ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: t } = await admin
    .from("launchpad_tokens")
    .select("id, name, ticker, logo_url, chain, mint_address, pool_address, arc_launch_id, market_cap_usd, price_usd, status")
    .ilike("ticker", ticker).in("status", ["active", "graduating", "graduated"]).maybeSingle();
  if (!t) { cache.set(key, { at: Date.now(), v: null }); return null; }

  const chain: "solana" | "arc" = t.chain === "arc" ? "arc" : "solana";
  let series: Series = { "1H": [], "1D": [], "1W": [], ALL: [] };
  let holds: number | null = null, profit: number | null = null, basis = 0;
  let price: number | null = t.price_usd != null ? Number(t.price_usd) : null;

  try {
    if (chain === "arc" && t.arc_launch_id) {
      const trades = await arcTradeList(origin, t.arc_launch_id);
      series = arcSeries(trades);
      const last = trades.at(-1)?.price;
      if (last) price = last;
      if (wallet && wallet.startsWith("0x") && price) {
        const { data: h } = await admin.from("arc_holdings").select("balance_raw").eq("wallet", wallet).eq("token_id", t.id).maybeSingle();
        const tokens = h ? Number(BigInt(h.balance_raw ?? "0")) / 1e18 : 0;
        holds = tokens * price;
        const mine = trades.filter((x) => x.trader === wallet);
        const buys = mine.filter((x) => x.isBuy).reduce((s, x) => s + x.usdcAmt, 0);
        const sells = mine.filter((x) => !x.isBuy).reduce((s, x) => s + x.usdcAmt, 0);
        if (buys > 0) { basis = buys; profit = holds + sells - buys; }
      }
    } else if (chain === "solana") {
      series = await solanaSeries(t.pool_address ?? null, t.mint_address ?? null);
      const last = series["1H"].at(-1) ?? series["1D"].at(-1);
      if (last) price = last;
      if (wallet && !wallet.startsWith("0x") && t.mint_address && price) {
        const pos = await solanaPosition(wallet, t.mint_address, price);
        holds = pos.holds; profit = pos.profit; basis = pos.basis;
      }
    }
  } catch { /* on renvoie ce qu'on a */ }

  const v: TokenCard = {
    token: { id: t.id, name: t.name, ticker: t.ticker, logo_url: t.logo_url ?? null, chain, market_cap_usd: t.market_cap_usd != null ? Number(t.market_cap_usd) : null, mint_address: t.mint_address ?? null },
    series, price_usd: price, holds_usd: holds,
    profit_usd: profit, return_pct: profit != null && basis > 0 ? (profit / basis) * 100 : null,
  };
  cache.set(key, { at: Date.now(), v });
  return v;
}
