/**
 * GET /api/launchpad/dbc-pool-state?poolAddress=...&quoteDecimals=...
 *
 * Returns the graduation progress for a Meteora DBC pool.
 * Response: { solRaised, gradThresholdSol, progressPct, graduated }
 *
 * solRaised        — quote raised (in human-readable units: SOL or xStock)
 * gradThresholdSol — quote needed for graduation (human-readable)
 * progressPct      — 0-100
 * graduated        — true if the pool has already migrated
 *
 * quoteDecimals (optional, default 9):
 *   9 for SOL pools (default, backwards-compatible)
 *   6 for xStock pools (Token-2022, 6 decimals)
 */

import { NextResponse } from "next/server";
import { solanaConnection } from "@/lib/solana/rpc";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

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

// Cache mémoire : chaque page de token interroge cette route toutes les 30 s, pour chaque visiteur.
// Sans cache, cela fait autant d'appels au RPC Solana (cause des « 429 Too Many Requests »).
const CACHE_MS = 20_000;
const cache = new Map<string, { at: number; body: Record<string, unknown> }>();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const poolAddress = searchParams.get("poolAddress");
    // quoteDecimals: 9 for SOL (default), 6 for xStock (Token-2022)
    const quoteDecimals = parseInt(searchParams.get("quoteDecimals") ?? "9", 10);
    const QUOTE_DIVISOR = Math.pow(10, quoteDecimals);

    if (!poolAddress) {
      return NextResponse.json({ error: "poolAddress required" }, { status: 400 });
    }

    const poolPk = tryPublicKey(poolAddress);
    if (!poolPk) {
      return NextResponse.json({ error: "Invalid poolAddress" }, { status: 400 });
    }
    const cacheKey = `${poolAddress}:${quoteDecimals}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.body);

    // ── Load DBC SDK ──────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let DynamicBondingCurveClient: any;
    try {
      const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
      DynamicBondingCurveClient = sdk.DynamicBondingCurveClient;
    } catch {
      return NextResponse.json({ error: "DBC SDK not installed" }, { status: 500 });
    }

    const connection = solanaConnection();
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
    const gradThresholdSol = gradThresholdLamports / QUOTE_DIVISOR;

    // ── Get current quote raised ───────────────────────────────────────────────
    // Try various field names from different SDK versions
    const quoteRaisedRaw = readBN(
      poolState.quoteReserve ??
      poolState.realQuoteReserve ??
      poolState.currentQuoteReserve ??
      poolState.swappedQuoteAmount ??
      0,
    );
    const solRaised = quoteRaisedRaw / QUOTE_DIVISOR;

    // ── Compute progress ──────────────────────────────────────────────────────
    const progressPct = gradThresholdSol > 0
      ? Math.min(100, Math.round((solRaised / gradThresholdSol) * 10000) / 100)
      : 0;

    const body = { solRaised, gradThresholdSol, progressPct, graduated };
    if (cache.size > 2000) cache.clear();
    cache.set(cacheKey, { at: Date.now(), body });
    return NextResponse.json(body, {
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
