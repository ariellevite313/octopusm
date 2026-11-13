/**
 * GET /api/terminal/stats?chain=…&mint=…
 * Chiffres d'un token pour l'onglet « À propos » du Terminal : prix, capitalisation, volume 24 h,
 * liquidité, variation 24 h, date de création de la pool. DexScreener d'abord, GeckoTerminal en repli.
 */
import { NextResponse } from "next/server";
import { GT_NET, type TerminalChain } from "@/lib/terminal";
import { SOL_MINT } from "@/lib/swap/core";

export const revalidate = 60;

const DS: Partial<Record<TerminalChain, string>> = {
  solana: "solana", base: "base", bnb: "bsc", hyperliquid: "hyperevm", ethereum: "ethereum",
  arbitrum: "arbitrum", polygon: "polygon", avalanche: "avalanche",
};

type Stats = { price: number | null; mcap: number | null; volume24h: number | null; liquidity: number | null; change24h: number | null; createdAt: string | null; pool: string | null };
const num = (v: unknown) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? n : null; };

type DsPair = {
  pairAddress?: string; baseToken?: { address?: string }; priceUsd?: string; marketCap?: number; fdv?: number;
  volume?: { h24?: number }; liquidity?: { usd?: number }; priceChange?: { h24?: number }; pairCreatedAt?: number;
};

async function fromDex(chain: TerminalChain, mint: string): Promise<Stats | null> {
  const ds = DS[chain];
  if (!ds) return null;
  const r = await fetch(`https://api.dexscreener.com/tokens/v1/${ds}/${mint}`, { signal: AbortSignal.timeout(7000), next: { revalidate: 60 } });
  if (!r.ok) return null;
  const pairs = ((await r.json()) as DsPair[] | null) ?? [];
  const lower = mint.toLowerCase();
  const mine = pairs.filter((p) => (p.baseToken?.address ?? "").toLowerCase() === lower);
  if (!mine.length) return null;
  // La pool la plus liquide donne le prix et la variation ; la liquidité et le volume sont additionnés sur toutes les pools
  const best = [...mine].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const liquidity = mine.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0);
  const volume = mine.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0);
  const oldest = mine.map((p) => p.pairCreatedAt ?? 0).filter((x) => x > 0).sort((a, b) => a - b)[0];
  return {
    price: num(best.priceUsd), mcap: num(best.marketCap) ?? num(best.fdv), volume24h: volume || null, liquidity: liquidity || null,
    change24h: num(best.priceChange?.h24), createdAt: oldest ? new Date(oldest).toISOString() : null, pool: best.pairAddress ?? null,
  };
}

async function fromGecko(chain: TerminalChain, mint: string): Promise<Stats | null> {
  const net = GT_NET[chain];
  if (!net) return null;
  const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${mint}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(7000), next: { revalidate: 120 } });
  if (!r.ok) return null;
  const a = ((await r.json()) as { data?: { attributes?: Record<string, unknown> } }).data?.attributes;
  if (!a) return null;
  return {
    price: num(a.price_usd), mcap: num(a.market_cap_usd) ?? num(a.fdv_usd), volume24h: num((a.volume_usd as { h24?: string } | undefined)?.h24),
    liquidity: num(a.total_reserve_in_usd), change24h: null, createdAt: null, pool: null,
  };
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const chain = (u.searchParams.get("chain") ?? "solana") as TerminalChain;
  const mint = u.searchParams.get("mint") ?? "";
  if (!/^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(mint)) return NextResponse.json({ stats: null }, { status: 400 });
  const [dex, gecko] = await Promise.all([fromDex(chain, mint).catch(() => null), fromGecko(chain, mint).catch(() => null)]);
  if (!dex && !gecko) return NextResponse.json({ stats: null });
  const s: Stats = {
    price: dex?.price ?? gecko?.price ?? null,
    mcap: dex?.mcap ?? gecko?.mcap ?? null,
    volume24h: dex?.volume24h ?? gecko?.volume24h ?? null,
    liquidity: dex?.liquidity ?? gecko?.liquidity ?? null,
    change24h: dex?.change24h ?? null,
    createdAt: dex?.createdAt ?? null,
    pool: dex?.pool ?? null,
  };
  // SOL : la « capitalisation » des pools de SOL enveloppé ne veut rien dire, la liste CoinGecko donne la vraie
  if (mint === SOL_MINT) s.mcap = null;
  return NextResponse.json({ stats: s }, { headers: { "Cache-Control": "public, s-maxage=60" } });
}
