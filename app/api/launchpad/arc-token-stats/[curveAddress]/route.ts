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

export async function GET(_req: Request, { params }: RouteParams) {
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

    // Convertir en float avant la division pour éviter la troncature bigint
    const reserveUsdc   = Number(reserveUsdcRaw   as bigint) / 1e6;   // USDC
    const reserveTokens = Number(reserveTokensRaw as bigint) / 1e18;  // tokens

    // Prix = reserveUsdc / reserveTokens → USDC par token
    const priceUsd = reserveTokens > 0 ? reserveUsdc / reserveTokens : null;

    const marketCap = priceUsd !== null ? priceUsd * TOTAL_SUPPLY : null;

    // Volume 24h : non calculé ici pour éviter le timeout (scan RPC long).
    // Il est mis à jour toutes les 5 min par le cron /api/cron/update-arc-stats.

    return NextResponse.json(
      {
        priceUsd,
        marketCap,
        fdv: marketCap,        // FDV = MarketCap pour bonding curve (supply fixe)
        volume24h: null,
        priceChange: null,     // pas d'historique OHLC disponible facilement
        holders: null,         // nécessite un indexeur EVM
        graduated: Boolean(graduated),
        reserveUsdc,
        reserveTokens,
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
