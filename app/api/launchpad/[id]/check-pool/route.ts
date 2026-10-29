/**
 * POST /api/launchpad/[id]/check-pool
 *
 * Checks on-chain whether the Meteora DBC virtual pool for this token's
 * mint already exists — without requiring a transaction signature.
 *
 * Called by the frontend after any TX B failure so we can recover from
 * the Phantom bug where it broadcasts successfully but fires an error
 * callback (leaving us without a signature).
 *
 * Strategy:
 *  1. Extract the DBC program ID from the cached TX B instructions
 *  2. Try known PDA seed combinations to derive the pool address
 *  3. getAccountInfo — if account exists, pool was created
 *  4. If found, mark token as active in DB
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { activateIfPoolExists } from "@/lib/launch/recover-pool";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const body = await req.json() as { walletAddress?: string };
    if (!body.walletAddress) {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token } = await admin
      .from("launchpad_tokens")
      .select("status, creator_wallet, mint_address, tx_base64, is_scheduled, stock_symbol, dbc_config_address")
      .eq("id", id)
      .maybeSingle();

    if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    if ((token.creator_wallet as string) !== body.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Already active — nothing to do
    if (token.status === "active" || token.status === "graduated") {
      return NextResponse.json({ found: true, alreadyActive: true });
    }

    if (!token.mint_address) {
      return NextResponse.json({ found: false, reason: "no mint address" });
    }
    if (!process.env.SOLANA_RPC_URL) return NextResponse.json({ found: false, reason: "no RPC" });

    const poolAddress = await activateIfPoolExists(admin, { id, ...token });
    if (!poolAddress) return NextResponse.json({ found: false });
    console.log(`[check-pool] pool found on-chain: ${poolAddress} for token ${id}`);
    return NextResponse.json({ found: true, poolAddress });

  } catch (err) {
    console.error("check-pool error:", err);
    return NextResponse.json({ found: false, error: String(err) });
  }
}
