/**
 * GET /api/admin/launchpad/debug-pool?pool=ADDRESS
 *
 * Dumps the raw pool state from the DBC SDK so we can see the actual field names.
 * ADMIN ONLY — remove or protect before production.
 */
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { requireAdminApi } from "@/lib/auth/require-admin";

export async function GET(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const poolAddr = searchParams.get("pool");
  if (!poolAddr) return NextResponse.json({ error: "?pool= required" }, { status: 400 });

  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) return NextResponse.json({ error: "SOLANA_RPC_URL not set" }, { status: 500 });

  const connection = new Connection(rpc, "confirmed");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let DynamicBondingCurveClient: any;
  try {
    const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    DynamicBondingCurveClient = sdk.DynamicBondingCurveClient;
  } catch {
    return NextResponse.json({ error: "DBC SDK not installed" }, { status: 500 });
  }

  const client = new DynamicBondingCurveClient(connection, "confirmed");
  const pool   = new PublicKey(poolAddr);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};

  // 1. Raw getPool
  try {
    const poolState = await client.state.getPool(pool);
    result.getPool_raw = poolState;
    result.getPool_keys = poolState ? Object.keys(poolState) : null;
    if (poolState?.poolState) {
      result.getPool_inner_keys = Object.keys(poolState.poolState);
      // Extract fee-related fields
      const inner = poolState.poolState;
      result.fee_fields = Object.fromEntries(
        Object.entries(inner).filter(([k]) =>
          k.toLowerCase().includes("fee") || k.toLowerCase().includes("trading")
        )
      );
    } else if (poolState) {
      result.fee_fields_flat = Object.fromEntries(
        Object.entries(poolState).filter(([k]) =>
          k.toLowerCase().includes("fee") || k.toLowerCase().includes("trading")
        )
      );
    }
  } catch (e) {
    result.getPool_error = e instanceof Error ? e.message : String(e);
  }

  // 2. getPoolFeeMetrics if available
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metrics = await (client as any).state.getPoolFeeMetrics(pool);
    result.getPoolFeeMetrics = metrics;
  } catch (e) {
    result.getPoolFeeMetrics_error = e instanceof Error ? e.message : String(e);
  }

  // 3. List all methods on client.state, client.partner, client.creator
  try {
    result.client_state_methods  = Object.getOwnPropertyNames(Object.getPrototypeOf(client.state)).filter(m => m !== "constructor");
    result.client_partner_methods = client.partner ? Object.getOwnPropertyNames(Object.getPrototypeOf(client.partner)).filter(m => m !== "constructor") : null;
    result.client_creator_methods = client.creator ? Object.getOwnPropertyNames(Object.getPrototypeOf(client.creator)).filter(m => m !== "constructor") : null;
  } catch (e) {
    result.methods_error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(result, { status: 200 });
}
