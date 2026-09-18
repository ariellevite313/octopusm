/**
 * GET /api/launchpad/arc-token-stats/[curveAddress]?isV4=1
 *
 * Retourne les stats de marché d'un token Arc.
 *
 * Mode V1 (isV4 absent ou 0) :
 *   Lit reserveUsdc / reserveTokens / graduated sur le BondingCurve clone.
 *   Holders = adresses uniques ayant émis l'event Trade V1 sur le clone.
 *
 * Mode V4 (isV4=1) :
 *   curveAddress = tokenAddress (ERC-20 = arc_launch_id).
 *   Lit getCurveState(poolId) sur le BondingCurveHook singleton.
 *   Holders = adresses uniques ayant émis l'event Trade V4 sur le hook (filtré par poolId).
 */

import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiParameters, decodeAbiParameters } from "viem";
import { arc } from "@/lib/arc-chain";
import {
  BONDING_CURVE_ABI,
  BONDING_CURVE_HOOK_ABI,
  ARC_HOOK_ADDRESS,
  TRADE_EVENT_TOPIC_V4,
  getArcV4PoolId,
} from "@/lib/arc-launchpad";

const TOTAL_SUPPLY = 1_000_000_000;
const ARCSCAN_API  = "https://explorer.arc.io/api";

// V1 Trade topic
const TRADE_TOPIC_V1 = "0x0c668488dc690d00c35c03638df49a1c8a7b63511eba0f88eeed1bd471719b16";

// ── Holders helpers ───────────────────────────────────────────────────────────

async function fetchUniqueTraders(address: string, topic0: string, topic1?: string): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      module: "logs", action: "getLogs",
      address, topic0, toBlock: "latest",
    });
    if (topic1) {
      params.set("topic1", topic1);
      params.set("topic0_1_opr", "and");
    }
    const res = await fetch(`${ARCSCAN_API}?${params}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json() as { status: string; result: unknown[] | string };
    // ArcScan status "0" means no records (result is a string like "No transactions found")
    if (!Array.isArray(json.result)) return 0;

    // V1: topics[1] = trader (first indexed). V4: topics[2] = trader (second indexed, after poolId).
    const topicIndex = topic1 ? 2 : 1;
    const traders = new Set(
      json.result
        .map((l: unknown) => (l as { topics?: string[] }).topics?.[topicIndex])
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
  const { searchParams } = new URL(req.url);
  const isV4 = searchParams.get("isV4") === "1";

  if (!curveAddress || !/^0x[0-9a-fA-F]{40}$/.test(curveAddress)) {
    return NextResponse.json({ error: "curveAddress invalide" }, { status: 400 });
  }

  try {
    const client = createPublicClient({ chain: arc, transport: http("https://rpc.mainnet.arc.io") });

    // ── V4 ────────────────────────────────────────────────────────────────────
    if (isV4) {
      if (!ARC_HOOK_ADDRESS) {
        return NextResponse.json({
          priceUsd: null, marketCap: null, fdv: null,
          volume24h: null, priceChange: null, holders: null,
        });
      }

      const poolId = getArcV4PoolId(curveAddress as `0x${string}`);

      const [state, holders] = await Promise.all([
        client.readContract({
          address:      ARC_HOOK_ADDRESS,
          abi:          BONDING_CURVE_HOOK_ABI,
          functionName: "getCurveState",
          args:         [poolId],
        }) as Promise<{ reserveUsdc: bigint; reserveTokens: bigint; lpAdded: boolean }>,
        fetchUniqueTraders(ARC_HOOK_ADDRESS, TRADE_EVENT_TOPIC_V4, poolId),
      ]);

      // USDC natif Arc = 18 decimals EVM
      const reserveUsdc   = Number(state.reserveUsdc)   / 1e18;
      const reserveTokens = Number(state.reserveTokens) / 1e18;
      const priceUsd      = reserveTokens > 0 ? reserveUsdc / reserveTokens : null;
      const marketCap     = priceUsd !== null ? priceUsd * TOTAL_SUPPLY : null;

      return NextResponse.json(
        {
          priceUsd, marketCap, fdv: marketCap,
          volume24h: null, priceChange: null,
          holders,
          graduated: state.lpAdded,
          reserveUsdc, reserveTokens,
        },
        { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } },
      );
    }

    // ── V1 ────────────────────────────────────────────────────────────────────
    const curve = curveAddress as `0x${string}`;

    const [[reserveUsdcRaw, reserveTokensRaw, graduated], holders] = await Promise.all([
      Promise.all([
        client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "reserveUsdc" }),
        client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "reserveTokens" }),
        client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "graduated" }),
      ]),
      fetchUniqueTraders(curveAddress, TRADE_TOPIC_V1),
    ]);

    const reserveUsdc   = Number(reserveUsdcRaw   as bigint) / 1e6;
    const reserveTokens = Number(reserveTokensRaw as bigint) / 1e18;
    const priceUsd      = reserveTokens > 0 ? reserveUsdc / reserveTokens : null;
    const marketCap     = priceUsd !== null ? priceUsd * TOTAL_SUPPLY : null;

    return NextResponse.json(
      {
        priceUsd, marketCap, fdv: marketCap,
        volume24h: null, priceChange: null,
        holders,
        graduated: Boolean(graduated),
        reserveUsdc, reserveTokens,
      },
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } },
    );

  } catch (err) {
    console.error("[arc-token-stats]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
