/**
 * GET /api/launchpad/token-stats/[mint]
 *
 * Agrège les données de marché depuis deux sources gratuites, sans clé API.
 *   - GeckoTerminal : prix, market cap, FDV, volume 24h, variation 24h
 *   - RPC public Solana (getProgramAccounts) : nombre de holders on-chain
 */
import { NextResponse } from "next/server";

const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

type RouteParams = { params: Promise<{ mint: string }> };

async function fetchHolderCount(mint: string): Promise<number | null> {
  try {
    const res = await fetch(PUBLIC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getProgramAccounts",
        params: [
          TOKEN_PROGRAM,
          {
            encoding: "base64",
            dataSlice: { offset: 0, length: 0 }, // ne renvoie pas les données, juste le compte
            filters: [
              { dataSize: 165 },                        // taille d'un compte token SPL
              { memcmp: { offset: 0, bytes: mint } },   // filtre sur le mint
            ],
          },
        ],
      }),
    });

    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const accounts: unknown[] = json?.result ?? [];
    return Array.isArray(accounts) && accounts.length > 0 ? accounts.length : null;
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
    priceUsd:    gtAttrs?.price_usd       ? parseFloat(gtAttrs.price_usd)      : null,
    marketCap:   gtAttrs?.market_cap_usd  ? parseFloat(gtAttrs.market_cap_usd) : null,
    fdv:         gtAttrs?.fdv_usd         ? parseFloat(gtAttrs.fdv_usd)        : null,
    volume24h:   gtAttrs?.volume_usd?.h24 ? parseFloat(gtAttrs.volume_usd.h24) : null,
    priceChange: gtAttrs?.price_change_percentage?.h24
                   ? parseFloat(gtAttrs.price_change_percentage.h24)           : null,
    holders,
  });
}
