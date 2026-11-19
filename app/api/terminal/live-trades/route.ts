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

export async function GET(req: Request) {
  { const lim = await limited(req, "live-trades", 120); if (lim) return lim; }
  const u = new URL(req.url);
  const network = u.searchParams.get("network") ?? "";
  const pool = u.searchParams.get("pool") ?? "";
  const mint = (u.searchParams.get("mint") ?? "").trim();
  if (!NETS.has(network) || !ADDR.test(pool) || !ADDR.test(mint)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pool}/trades`, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), next: { revalidate: 4 },
    });
    if (!r.ok) return NextResponse.json({ trades: [] }, { status: r.status === 404 ? 200 : 502 });
    const j = (await r.json()) as { data?: GtTrade[] };
    const m = mint.toLowerCase();
    const trades: LiveTrade[] = [];
    for (const { attributes: a } of j.data ?? []) {
      if (a.is_anomalous) continue;
      const buy = a.to_token_address.toLowerCase() === m;
      const sell = a.from_token_address.toLowerCase() === m;
      if (!buy && !sell) continue;
      const amount = Number(buy ? a.to_token_amount : a.from_token_amount);
      const price = Number(buy ? a.price_to_in_usd : a.price_from_in_usd);
      trades.push({ tx: a.tx_hash, wallet: a.tx_from_address, side: buy ? "buy" : "sell", usd: Number(a.volume_in_usd) || 0, amount, price, t: Date.parse(a.block_timestamp) });
      if (trades.length >= 80) break;
    }
    return NextResponse.json({ trades }, { headers: { "Cache-Control": "public, max-age=3, s-maxage=4" } });
  } catch {
    return NextResponse.json({ trades: [] }, { status: 502 });
  }
}
