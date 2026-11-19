/**
 * GET /api/terminal/live-trades?network=solana&pool=…&mint=…
 * Derniers achats et ventes d'un token, tous wallets confondus (pas seulement ceux passés par OM), via GeckoTerminal.
 * Le côté (achat/vente) est relu par rapport au token demandé, pas au token de base du pool.
 */
import { NextResponse } from "next/server";
import { limited } from "@/lib/limit";

const NETS = new Set(["solana", "base", "bsc", "hyperevm", "eth", "arbitrum", "polygon_pos", "avax", "elysium", "robinhood"]);
const ADDR = /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})$/;

type GtTrade = { attributes: {
  block_timestamp: string; tx_hash: string; tx_from_address: string; kind: string;
  from_token_address: string; to_token_address: string; from_token_amount: string; to_token_amount: string;
  price_from_in_usd: string; price_to_in_usd: string; volume_in_usd: string; is_anomalous?: boolean;
} };

export type LiveTrade = { tx: string; wallet: string; side: "buy" | "sell"; usd: number; amount: number; price: number; t: number };

const GT = "https://api.geckoterminal.com/api/v2";

async function poolTrades(network: string, pool: string, m: string): Promise<{ trades: LiveTrade[]; ok: boolean }> {
  try {
    const r = await fetch(`${GT}/networks/${network}/pools/${pool}/trades`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), next: { revalidate: 4 } });
    if (!r.ok) return { trades: [], ok: r.status === 404 };
    const j = (await r.json()) as { data?: GtTrade[] };
    const trades: LiveTrade[] = [];
    for (const { attributes: a } of j.data ?? []) {
      const buy = (a.to_token_address ?? "").toLowerCase() === m;
      const sell = (a.from_token_address ?? "").toLowerCase() === m;
      if (!buy && !sell) continue;
      const amount = Number(buy ? a.to_token_amount : a.from_token_amount);
      const price = Number(buy ? a.price_to_in_usd : a.price_from_in_usd);
      let usd = Number(a.volume_in_usd) || 0;
      if (!usd && amount > 0 && price > 0) usd = amount * price; // volume absent sur les toutes premières transactions
      if (!(amount > 0)) continue;
      trades.push({ tx: a.tx_hash, wallet: a.tx_from_address, side: buy ? "buy" : "sell", usd, amount, price, t: Date.parse(a.block_timestamp) });
    }
    return { trades, ok: true };
  } catch { return { trades: [], ok: false }; }
}

/** Autres pools du token (migration d'une courbe de lancement, plusieurs DEX) : les plus actives d'abord. */
async function otherPools(network: string, mint: string, skip: string): Promise<string[]> {
  try {
    const r = await fetch(`${GT}/networks/${network}/tokens/${mint}/pools?page=1&sort=h24_volume_usd_liquidity_desc`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), next: { revalidate: 60 } });
    if (!r.ok) return [];
    const j = (await r.json()) as { data?: { attributes?: { address?: string } }[] };
    return (j.data ?? []).map((p) => p.attributes?.address ?? "").filter((a) => a && a.toLowerCase() !== skip.toLowerCase()).slice(0, 2);
  } catch { return []; }
}

export async function GET(req: Request) {
  { const lim = await limited(req, "live-trades", 120); if (lim) return lim; }
  const u = new URL(req.url);
  const network = u.searchParams.get("network") ?? "";
  const pool = u.searchParams.get("pool") ?? "";
  const mint = (u.searchParams.get("mint") ?? "").trim();
  if (!NETS.has(network) || (pool && !ADDR.test(pool)) || !ADDR.test(mint)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const m = mint.toLowerCase();
  const first = pool ? await poolTrades(network, pool, m) : { trades: [] as LiveTrade[], ok: false };
  let all = first.trades;
  // Pas de pool connue, ou presque rien dedans : on regarde les autres pools du token (nouveau token, migration, plusieurs DEX)
  if (all.length < 10) {
    const extra = await otherPools(network, mint, pool);
    const more = await Promise.all(extra.map((p) => poolTrades(network, p, m)));
    all = all.concat(more.flatMap((x) => x.trades));
  }
  const seen = new Set<string>();
  const trades = all.filter((t) => { const k = `${t.tx}:${t.side}:${t.wallet}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.t - a.t).slice(0, 80);
  return NextResponse.json({ trades }, { headers: { "Cache-Control": "public, max-age=3, s-maxage=4" } });
}
