/**
 * GET /api/launchpad/arc-token-stats/[curveAddress]
 *
 * Retourne les stats de marché d'un token Arc depuis le contrat BondingCurve.
 * - price    : reserveUsdc / reserveTokens (USDC par token)
 * - marketCap: price * 1 000 000 000 (supply fixe = 1B tokens)
 * - volume24h: somme des usdcAmt des trades des dernières 24h
 * - holders  : non disponible on-chain sans indexeur (retourné null)
 */

import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { arcTestnet } from "@/lib/arc-chain";
import { BONDING_CURVE_ABI } from "@/lib/arc-launchpad";

const TOTAL_SUPPLY = 1_000_000_000; // 1B tokens (fixe pour tous les tokens Arc)

type RouteParams = { params: Promise<{ curveAddress: string }> };

async function getVolume24h(curveAddress: string, baseUrl: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${baseUrl}/api/launchpad/arc-trades?curveAddress=${curveAddress}&limit=1000`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return null;
    const json = await res.json() as { trades?: { timestamp: number; usdcAmt: number }[] };
    if (!json.trades?.length) return 0;
    const since = Date.now() / 1000 - 86400; // 24h ago (unix)
    const vol = json.trades
      .filter(t => t.timestamp >= since)
      .reduce((s, t) => s + t.usdcAmt, 0);
    return vol;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: RouteParams) {
  const { curveAddress } = await params;

  if (!curveAddress || !/^0x[0-9a-fA-F]{40}$/.test(curveAddress)) {
    return NextResponse.json({ error: "curveAddress invalide" }, { status: 400 });
  }

  try {
    const client = createPublicClient({
      chain: arcTestnet,
      transport: http(),
    });

    const curve = curveAddress as `0x${string}`;

    // Lire les réserves du contrat en parallèle
    const [reserveUsdcRaw, reserveTokensRaw, graduated] = await Promise.all([
      client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "reserveUsdc" }),
      client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "reserveTokens" }),
      client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "graduated" }),
    ]);

    const reserveUsdc   = Number(reserveUsdcRaw as bigint);   // 6 décimales
    const reserveTokens = Number(reserveTokensRaw as bigint); // 18 décimales

    // Prix = reserveUsdc (6 dec) / reserveTokens (18 dec) → USDC par token
    const priceUsd = reserveTokens > 0
      ? Number((reserveUsdcRaw as bigint) * 10n ** 12n / (reserveTokensRaw as bigint)) / 1e12
      : null;

    const marketCap = priceUsd !== null ? priceUsd * TOTAL_SUPPLY : null;

    // Volume 24h depuis arc-trades
    const origin = new URL(req.url).origin;
    const volume24h = await getVolume24h(curveAddress, origin);

    return NextResponse.json(
      {
        priceUsd,
        marketCap,
        fdv: marketCap,        // FDV = MarketCap pour bonding curve (supply fixe)
        volume24h,
        priceChange: null,     // pas d'historique OHLC disponible facilement
        holders: null,         // nécessite un indexeur EVM
        graduated: Boolean(graduated),
        reserveUsdc:   reserveUsdc / 1e6,
        reserveTokens: reserveTokens / 1e18,
      },
      {
        headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
      }
    );
  } catch (err) {
    console.error("[arc-token-stats]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
