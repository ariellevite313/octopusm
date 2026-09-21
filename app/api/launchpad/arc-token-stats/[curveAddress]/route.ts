/**
 * GET /api/launchpad/arc-token-stats/[curveAddress]
 *
 * Retourne les stats de marché d'un token Arc V2.
 * curveAddress = adresse du BondingCurveArcV2 (arc_launch_id en DB).
 *
 * Lit sur BondingCurveArcV2 :
 *   reserveUsdc / reserveTokens / graduated / realUsdcRaised / progressBps
 *
 * Holders = adresses uniques ayant émis l'event Trade V2 sur la curve.
 */

import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { arc } from "@/lib/arc-chain";
import {
  BONDING_CURVE_V2_ABI,
  TRADE_EVENT_TOPIC,
} from "@/lib/arc-launchpad";

const TOTAL_SUPPLY = 1_000_000_000;
const ARCSCAN_API  = "https://explorer.arc.io/api";

async function fetchUniqueTraders(curveAddress: string): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      module: "logs", action: "getLogs",
      address: curveAddress, topic0: TRADE_EVENT_TOPIC, toBlock: "latest",
    });
    const res = await fetch(`${ARCSCAN_API}?${params}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json() as { status: string; result: unknown[] | string };
    if (!Array.isArray(json.result)) return 0;
    // Trade : topics[1] = trader (first indexed)
    const traders = new Set(
      json.result
        .map((l: unknown) => (l as { topics?: string[] }).topics?.[1])
        .filter((t): t is string => typeof t === "string" && t.length === 66)
        .map(t => t.toLowerCase())
    );
    return traders.size;
  } catch {
    return null;
  }
}

type RouteParams = { params: Promise<{ curveAddress: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { curveAddress } = await params;

  if (!curveAddress || !/^0x[0-9a-fA-F]{40}$/.test(curveAddress)) {
    return NextResponse.json({ error: "curveAddress invalide" }, { status: 400 });
  }

  try {
    const client    = createPublicClient({ chain: arc, transport: http("https://rpc.mainnet.arc.io") });
    const curveAddr = curveAddress as `0x${string}`;

    const [[reserveUsdcRaw, reserveTokensRaw, graduated, realRaised, pbps], holders] = await Promise.all([
      Promise.all([
        client.readContract({ address: curveAddr, abi: BONDING_CURVE_V2_ABI, functionName: "reserveUsdc" }),
        client.readContract({ address: curveAddr, abi: BONDING_CURVE_V2_ABI, functionName: "reserveTokens" }),
        client.readContract({ address: curveAddr, abi: BONDING_CURVE_V2_ABI, functionName: "graduated" }),
        client.readContract({ address: curveAddr, abi: BONDING_CURVE_V2_ABI, functionName: "realUsdcRaised" }),
        client.readContract({ address: curveAddr, abi: BONDING_CURVE_V2_ABI, functionName: "progressBps" }),
      ]),
      fetchUniqueTraders(curveAddress),
    ]);

    // USDC Arc natif = 18 decimals EVM
    const reserveUsdc   = Number(reserveUsdcRaw   as bigint) / 1e18;
    const reserveTokens = Number(reserveTokensRaw as bigint) / 1e18;
    const priceUsd      = reserveTokens > 0 ? reserveUsdc / reserveTokens : null;
    const marketCap     = priceUsd !== null ? priceUsd * TOTAL_SUPPLY : null;
    const realUsdcRaisedNum = Number(realRaised as bigint) / 1e18;
    const progressBps   = Number(pbps as bigint);

    return NextResponse.json(
      {
        priceUsd, marketCap, fdv: marketCap,
        volume24h: null, priceChange: null,
        holders,
        graduated: Boolean(graduated),
        reserveUsdc, reserveTokens,
        realUsdcRaised: realUsdcRaisedNum,
        progressBps,
      },
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } },
    );

  } catch (err) {
    console.error("[arc-token-stats]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
