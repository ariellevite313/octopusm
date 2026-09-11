/**
 * GET /api/launchpad/arc-token-stats/[curveAddress]
 *
 * Retourne les stats de marché d'un token Arc depuis le contrat BondingCurve.
 * - price    : reserveUsdc / reserveTokens (USDC par token)
 * - marketCap: price * 1 000 000 000 (supply fixe = 1B tokens)
 * - volume24h: somme des usdcAmt des trades des dernières 24h
 * - holders  : nb d'adresses uniques ayant tradé (topics[1] des logs ArcScan)
 */

import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { arcTestnet } from "@/lib/arc-chain";
import { BONDING_CURVE_ABI } from "@/lib/arc-launchpad";

const TOTAL_SUPPLY = 1_000_000_000;
const ARCSCAN_API  = "https://testnet.arcscan.app/api";
const TRADE_TOPIC  = "0x0c668488dc690d00c35c03638df49a1c8a7b63511eba0f88eeed1bd471719b16";

async function fetchUniqueTraders(address: string): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      module: "logs", action: "getLogs",
      address, topic0: TRADE_TOPIC, toBlock: "latest",
    });
    const res = await fetch(`${ARCSCAN_API}?${params}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json() as { status: string; result: unknown[] | string };
    if (!Array.isArray(json.result)) return null;
    // topics[1] = trader address (first indexed param)
    const traders = new Set(
      json.result
        .map((l: unknown) => (l as { topics?: string[] }).topics?.[1])
        .filter((t): t is string => typeof t === "string" && t.length === 66)
        // normalize to checksummed-length address (last 40 hex chars)
        .map(t => t.toLowerCase())
    );
    return traders.size;
  } catch {
    return null;
  }
}

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

    // Lire les réserves + compter les holders en parallèle
    const [[reserveUsdcRaw, reserveTokensRaw, graduated], holders] = await Promise.all([
      Promise.all([
        client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "reserveUsdc" }),
        client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "reserveTokens" }),
        client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "graduated" }),
      ]),
      fetchUniqueTraders(curveAddress),
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
        priceChange: null,
        holders,               // nb d'adresses uniques ayant tradé (proxy holders)
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
