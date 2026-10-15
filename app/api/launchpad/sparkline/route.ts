/**
 * GET /api/launchpad/sparkline?chain=solana&pool=...&mint=...
 * GET /api/launchpad/sparkline?chain=arc&curve=0x...
 *
 * Petite série de prix (≈ 24 points) pour la mini-courbe des listes.
 * Mis en cache 5 min côté serveur pour ne pas surcharger les sources.
 */
import { NextResponse } from "next/server";

const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; points: number[] }>();

async function solanaPoints(pool: string | null, mint: string | null): Promise<number[]> {
  let addr = pool;
  if (!addr && mint) {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addr = ((await r.json()) as any)?.data?.[0]?.attributes?.address ?? null;
  }
  if (!addr) return [];
  const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${addr}/ohlcv/hour?aggregate=1&limit=24&currency=usd`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = ((await r.json()) as any)?.data?.attributes?.ohlcv_list as [number, number, number, number, number][] | undefined;
  return (list ?? []).slice().reverse().map(k => Number(k[4])).filter(n => n > 0);
}

async function arcPoints(origin: string, curve: string): Promise<number[]> {
  const r = await fetch(`${origin}/api/launchpad/arc-trades?curveAddress=${encodeURIComponent(curve)}&limit=200`,
    { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return [];
  const { trades } = (await r.json()) as { trades?: { timestamp: number; price: number }[] };
  const sorted = (trades ?? []).filter(t => t.price > 0).sort((a, b) => a.timestamp - b.timestamp);
  return sorted.slice(-40).map(t => t.price);
}

export async function GET(req: Request) {
  const url   = new URL(req.url);
  const chain = url.searchParams.get("chain");
  const pool  = url.searchParams.get("pool");
  const mint  = url.searchParams.get("mint");
  const curve = url.searchParams.get("curve");
  const key   = `${chain}:${pool ?? mint ?? curve}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ points: hit.points });

  let points: number[] = [];
  try {
    if (chain === "arc" && curve) points = await arcPoints(url.origin, curve);
    else if (pool || mint)        points = await solanaPoints(pool, mint);
  } catch { /* courbe plate côté client */ }

  cache.set(key, { at: Date.now(), points });
  return NextResponse.json({ points }, { headers: { "Cache-Control": "public, s-maxage=300" } });
}
