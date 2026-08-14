/**
 * GET /api/launchpad/token-stats/[mint]
 *
 * Server-side proxy that fetches token market data from:
 *   - GeckoTerminal: price, market cap, FDV, 24h volume, 24h price change
 *   - Birdeye public API: holder count
 *
 * Returns:
 *   { priceUsd, marketCap, fdv, volume24h, priceChange, holders }
 */
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ mint: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { mint } = await params;
  if (!mint) return NextResponse.json({ error: "mint required" }, { status: 400 });

  const [gtRes, birdRes] = await Promise.allSettled([
    fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}`,
      { headers: { Accept: "application/json" } }
    ),
    fetch(
      `https://public-api.birdeye.so/defi/token_overview?address=${mint}`,
      { headers: { Accept: "application/json", "x-chain": "solana" } }
    ),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let gtAttrs: any = null;
  if (gtRes.status === "fulfilled" && gtRes.value.ok) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await gtRes.value.json() as any;
      gtAttrs = json?.data?.attributes ?? null;
    } catch { /* ignore */ }
  }

  let holders: number | null = null;
  if (birdRes.status === "fulfilled" && birdRes.value.ok) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await birdRes.value.json() as any;
      const h = json?.data?.holder;
      if (typeof h === "number" && h > 0) holders = h;
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    priceUsd:    gtAttrs?.price_usd       ? parseFloat(gtAttrs.price_usd)          : null,
    marketCap:   gtAttrs?.market_cap_usd  ? parseFloat(gtAttrs.market_cap_usd)     : null,
    fdv:         gtAttrs?.fdv_usd         ? parseFloat(gtAttrs.fdv_usd)            : null,
    volume24h:   gtAttrs?.volume_usd?.h24 ? parseFloat(gtAttrs.volume_usd.h24)     : null,
    priceChange: gtAttrs?.price_change_percentage?.h24
                   ? parseFloat(gtAttrs.price_change_percentage.h24)               : null,
    holders,
  });
}
