/**
 * GET /api/launchpad/token-stats/[mint]
 *
 * Server-side proxy — no API key required.
 *   - GeckoTerminal : price, market cap, FDV, 24h volume, 24h price change
 *   - Solscan public API : holder count
 */
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ mint: string }> };

async function fetchHolderCount(mint: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://public-api.solscan.io/token/holders?tokenAddress=${mint}&limit=1&offset=0`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const total = json?.total;
    return typeof total === "number" && total > 0 ? total : null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { mint } = await params;
  if (!mint) return NextResponse.json({ error: "mint required" }, { status: 400 });

  const [gtRes, holders] = await Promise.all([
    fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}`,
      { headers: { Accept: "application/json" } }
    ).catch(() => null),
    fetchHolderCount(mint),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let gtAttrs: any = null;
  if (gtRes?.ok) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await gtRes.json() as any;
      gtAttrs = json?.data?.attributes ?? null;
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
