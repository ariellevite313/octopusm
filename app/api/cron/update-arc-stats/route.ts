/**
 * GET /api/cron/update-arc-stats
 *
 * Met à jour price_usd, market_cap_usd et volume_24h_usd dans launchpad_tokens
 * pour tous les tokens Arc V2 actifs (chain = 'arc').
 *
 * Lit directement BondingCurveArcV2.reserveUsdc / reserveTokens.
 * USDC Arc = natif 18 decimals.
 *
 * Vercel cron : toutes les 5 minutes.
 * Sécurisé par CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { arc } from "@/lib/arc-chain";
import { BONDING_CURVE_V2_ABI } from "@/lib/arc-launchpad";
import { createAdminClient } from "@/lib/supabase/server";

const TOTAL_SUPPLY = 1_000_000_000;
const TIMEOUT_MS   = 8_000;

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T | null> {
  return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);
}

async function getReservesV2(
  client: ReturnType<typeof createPublicClient>,
  curve: `0x${string}`,
): Promise<{ priceUsd: number; marketCap: number } | null> {
  try {
    const [usdcRaw, tokRaw] = await Promise.all([
      client.readContract({ address: curve, abi: BONDING_CURVE_V2_ABI, functionName: "reserveUsdc" }),
      client.readContract({ address: curve, abi: BONDING_CURVE_V2_ABI, functionName: "reserveTokens" }),
    ]);
    const tok = tokRaw as bigint;
    const usd = usdcRaw as bigint;
    if (tok === 0n) return null;
    const reserveUsdc   = Number(usd) / 1e18; // USDC natif Arc 18 dec
    const reserveTokens = Number(tok) / 1e18;
    const priceUsd  = reserveUsdc / reserveTokens;
    const marketCap = priceUsd * TOTAL_SUPPLY;
    return { priceUsd, marketCap };
  } catch {
    return null;
  }
}

async function getVolume24h(curveAddress: string, origin: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${origin}/api/launchpad/arc-trades?curveAddress=${curveAddress}&limit=1000`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const json = await res.json() as { trades?: { timestamp: number; usdcAmt: number }[] };
    if (!json.trades?.length) return 0;
    const since = Date.now() / 1000 - 86_400;
    return json.trades.filter(t => t.timestamp >= since).reduce((s, t) => s + t.usdcAmt, 0);
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin  = createAdminClient() as any;
    const origin = new URL(req.url).origin;

    const { data: tokens, error } = await admin
      .from("launchpad_tokens")
      .select("id, arc_launch_id")
      .eq("chain", "arc")
      .in("status", ["active", "graduating", "graduated"])
      .not("arc_launch_id", "is", null);

    if (error) throw error;
    if (!tokens?.length) return NextResponse.json({ updated: 0 });

    const client = createPublicClient({ chain: arc, transport: http("https://rpc.mainnet.arc.io") });

    type TokenRow = { id: string; arc_launch_id: string };

    const results = await Promise.allSettled(
      (tokens as TokenRow[]).map(async (t) => {
        const curveAddr = t.arc_launch_id as `0x${string}`;

        const [reserves, volume24h] = await Promise.all([
          withTimeout(getReservesV2(client, curveAddr)),
          withTimeout(getVolume24h(t.arc_launch_id, origin)),
        ]);

        if (!reserves) return { id: t.id, skipped: true };

        const { error: upErr } = await admin
          .from("launchpad_tokens")
          .update({
            price_usd:      reserves.priceUsd,
            market_cap_usd: reserves.marketCap,
            volume_24h_usd: volume24h ?? 0,
          })
          .eq("id", t.id);

        if (upErr) throw upErr;
        return { id: t.id, priceUsd: reserves.priceUsd, marketCap: reserves.marketCap, volume24h };
      }),
    );

    const updated = results.filter(r => r.status === "fulfilled" && !(r.value as { skipped?: boolean }).skipped).length;
    const failed  = results.filter(r => r.status === "rejected").length;

    console.log(`[update-arc-stats] updated=${updated} failed=${failed}/${tokens.length}`);
    return NextResponse.json({ updated, failed, total: tokens.length });

  } catch (err) {
    console.error("[update-arc-stats]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
