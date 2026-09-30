/**
 * GET /api/v1/creators/{address}/summary
 *
 * Returns a creator's aggregate USDC earnings across all their Arc tokens.
 *
 * Response:
 * {
 *   "address":           "0x…",
 *   "tokens":            2,
 *   "earned_total_usdc": "12.34",   // claimed + claimable
 *   "claimed_usdc":      "10.00",   // from DB (creator_fee_claims)
 *   "claimable_usdc":    "2.34",    // on-chain creatorAccrued() sum
 *   "updated_at":        "2026-10-01T12:00:00.000Z"
 * }
 *
 * Unknown address → 200 with zeros.
 * Invalid address → 400.
 */

import { NextResponse } from "next/server";
import { createAdminClient }          from "@/lib/supabase/server";
import {
  isValidEvm, json, err, corsOk, checkRateLimit, getIp,
  readUint256, SEL_CREATOR_ACCRUED, weiToDecStr,
} from "@/lib/v1/helpers";

export async function OPTIONS() { return corsOk(); }

export async function GET(
  req: Request,
  { params }: { params: { address: string } },
) {
  // Rate limit
  if (!checkRateLimit(getIp(req))) {
    return err("Too Many Requests", 429);
  }

  const address = params.address.toLowerCase();
  if (!isValidEvm(address)) {
    return err("Invalid Arc address (expected 0x + 40 hex chars)", 400);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Fetch creator's Arc tokens from DB
  const { data: tokenRows } = await admin
    .from("launchpad_tokens")
    .select("id, arc_launch_id")
    .ilike("creator_wallet", address)
    .eq("chain", "arc")
    .in("status", ["active", "graduating", "graduated"]);

  const tokens = (tokenRows ?? []) as { id: string; arc_launch_id: string | null }[];

  // 2. Claimable: sum creatorAccrued() on-chain for each V2 curve
  const v2Tokens = tokens.filter(
    t =>
      t.arc_launch_id?.startsWith("0x") &&
      t.arc_launch_id.length === 42,
  );

  let claimableBig = 0n;
  if (v2Tokens.length > 0) {
    const accruals = await Promise.all(
      v2Tokens.map(t =>
        readUint256(t.arc_launch_id!, SEL_CREATOR_ACCRUED).catch(() => 0n),
      ),
    );
    claimableBig = accruals.reduce((s, v) => s + v, 0n);
  }

  // 3. Claimed: sum amount_usdc from DB
  const { data: claimRows } = await admin
    .from("creator_fee_claims")
    .select("amount_usdc")
    .eq("chain", "arc")
    .ilike("wallet", address);

  const claimedUsdc = ((claimRows ?? []) as { amount_usdc: string | null }[]).reduce(
    (s, r) => s + parseFloat(r.amount_usdc ?? "0"),
    0,
  );

  const claimableUsdc = Number(claimableBig) / 1e18;
  const earnedTotal   = claimedUsdc + claimableUsdc;

  return json({
    address,
    tokens:            tokens.length,
    earned_total_usdc: earnedTotal.toFixed(6),
    claimed_usdc:      claimedUsdc.toFixed(6),
    claimable_usdc:    weiToDecStr(claimableBig),
    updated_at:        new Date().toISOString(),
  });
}

export const dynamic = "force-dynamic";
