/**
 * GET /api/launchpad/token-stats/[mint]
 *
 * Agrège les données de marché depuis deux sources gratuites, sans clé API.
 *   - GeckoTerminal : prix, market cap, FDV, volume 24h, variation 24h
 *   - RPC public Solana (getProgramAccounts) : nombre de holders on-chain
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

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

  const [dsRes, gtRes, holders] = await Promise.all([
    fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
      { headers: { Accept: "application/json" } }
    ).catch(() => null),
    fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}`,
      { headers: { Accept: "application/json" } }
    ).catch(() => null),
    fetchHolderCount(mint),
  ]);

  // Try DexScreener first (indexes Meteora DBC), then GeckoTerminal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let priceUsd: number | null = null, marketCap: number | null = null,
      fdv: number | null = null, volume24h: number | null = null,
      priceChange: number | null = null;

  if (dsRes?.ok) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await dsRes.json() as any;
      const pair = json?.pairs?.[0];
      if (pair) {
        priceUsd  = pair.priceUsd        ? parseFloat(pair.priceUsd)        : null;
        marketCap = pair.marketCap       ? parseFloat(pair.marketCap)       : null;
        fdv       = pair.fdv             ? parseFloat(pair.fdv)             : null;
        volume24h = pair.volume?.h24     ? parseFloat(pair.volume.h24)      : null;
        priceChange = pair.priceChange?.h24 ? parseFloat(pair.priceChange.h24) : null;
      }
    } catch { /* ignore */ }
  }

  if (priceUsd === null && gtRes?.ok) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await gtRes.json() as any;
      const a = json?.data?.attributes;
      if (a) {
        priceUsd    = a.price_usd       ? parseFloat(a.price_usd)      : null;
        marketCap   = a.market_cap_usd  ? parseFloat(a.market_cap_usd) : null;
        fdv         = a.fdv_usd         ? parseFloat(a.fdv_usd)        : null;
        volume24h   = a.volume_usd?.h24 ? parseFloat(a.volume_usd.h24) : null;
        priceChange = a.price_change_percentage?.h24
                        ? parseFloat(a.price_change_percentage.h24) : null;
      }
    } catch { /* ignore */ }
  }

  // Fallback: if GeckoTerminal has no data, use values stored in DB by the cron
  if (priceUsd === null && marketCap === null && volume24h === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;
      const { data: row } = await admin
        .from("launchpad_tokens")
        .select("price_usd, market_cap_usd, volume_24h_usd")
        .eq("mint_address", mint)
        .maybeSingle();

      if (row) {
        return NextResponse.json({
          priceUsd:    row.price_usd    ?? null,
          marketCap:   row.market_cap_usd ?? null,
          fdv:         null,
          volume24h:   row.volume_24h_usd ?? null,
          priceChange: null,
          holders,
        });
      }
    } catch { /* ignore, fall through */ }
  }

  return NextResponse.json({ priceUsd, marketCap, fdv, volume24h, priceChange, holders });
}
