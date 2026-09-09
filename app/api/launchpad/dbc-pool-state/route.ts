/**
 * GET /api/launchpad/dbc-pool-state?poolAddress=...
 *
 * Returns the graduation progress for a Meteora DBC pool.
 * Response: { solRaised, gradThresholdSol, progressPct, graduated }
 *
 * solRaised        — SOL currently raised (real quote reserves, in SOL)
 * gradThresholdSol — SOL needed for graduation (from pool config)
 * progressPct      — 0-100
 * graduated        — true if the pool has already migrated
 */

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const LAMPORTS = 1_000_000_000;

function tryPublicKey(s: string): PublicKey | null {
  try { return new PublicKey(s); } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readBN(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  // BN.js object
  if (typeof v === "object" && typeof v.toNumber === "function") {
    try { return v.toNumber(); } catch { return Number(v.toString()); }
  }
  return Number(String(v));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const poolAddress = searchParams.get("poolAddress");

    if (!poolAddress) {
      return NextResponse.json({ error: "poolAddress required" }, { status: 400 });
    }

    const poolPk = tryPublicKey(poolAddress);
    if (!poolPk) {
      return NextResponse.json({ error: "Invalid poolAddress" }, { status: 400 });
    }

    // ── Load DBC SDK ──────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let DynamicBondingCurveClient: any;
    try {
      const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
      DynamicBondingCurveClient = sdk.DynamicBondingCurveClient;
    } catch {
      return NextResponse.json({ error: "DBC SDK not installed" }, { status: 500 });
    }

    const connection = new Connection(RPC_URL, "confirmed");
    const client = new DynamicBondingCurveClient(connection, "confirmed");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const virtualPool: any = await client.state.getPool(poolPk);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = await client.state.getPoolConfig(virtualPool.poolState.config);

    const poolState = virtualPool.poolState;

    // ── Check if already graduated ────────────────────────────────────────────
    // migrationProgress == 1 or status != active means graduated
    const migrationProgress = readBN(poolState.migrationProgress ?? poolState.migrationQuoteProgress);
    const graduated = migrationProgress >= 1 || poolState.graduated === true || poolState.status === 1;

    // ── Get graduation threshold (lamports → SOL) ─────────────────────────────
    const configState = config.configState ?? config;
    const gradThresholdLamports = readBN(
      configState.migrationQuoteThreshold ??
      configState.graduationQuoteThreshold ??
      configState.quoteThreshold ??
      0,
    );
    const gradThresholdSol = gradThresholdLamports / LAMPORTS;

    // ── Get current SOL raised ─────────────────────────────────────────────────
    // Try various field names from different SDK versions
    const quoteRaisedLamports = readBN(
      poolState.quoteReserve ??
      poolState.realQuoteReserve ??
      poolState.currentQuoteReserve ??
      poolState.swappedQuoteAmount ??
      0,
    );
    const solRaised = quoteRaisedLamports / LAMPORTS;

    // ── Compute progress ──────────────────────────────────────────────────────
    const progressPct = gradThresholdSol > 0
      ? Math.min(100, Math.round((solRaised / gradThresholdSol) * 10000) / 100)
      : 0;

    return NextResponse.json({
      solRaised,
      gradThresholdSol,
      progressPct,
      graduated,
    }, {
      headers: {
        // Cache for 30s — pool state changes slowly
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });

  } catch (err) {
    console.error("[dbc-pool-state] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
