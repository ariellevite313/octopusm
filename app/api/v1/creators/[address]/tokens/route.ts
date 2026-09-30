/**
 * GET /api/v1/creators/{address}/tokens
 *
 * Returns all Arc tokens created by the address, with per-token USDC breakdowns.
 * claimable_usdc is read live from BondingCurveArcV2.creatorAccrued().
 * claimed_usdc is summed from creator_fee_claims DB table.
 *
 * Response: Array of {
 *   "token_address":  "0x…",       // OMToken / mint_address
 *   "curve_address":  "0x…",       // BondingCurveArcV2 clone
 *   "name":           "FooToken",
 *   "symbol":         "FOO",
 *   "image":          "https://…" | null,
 *   "created_at":     "2026-09-21T…",
 *   "earned_usdc":    "5.123456",
 *   "claimed_usdc":   "3.000000",
 *   "claimable_usdc": "2.123456"
 * }
 */

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
  if (!checkRateLimit(getIp(req))) return err("Too Many Requests", 429);

  const address = params.address.toLowerCase();
  if (!isValidEvm(address)) return err("Invalid Arc address", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Tokens owned by this creator
  const { data: tokenRows } = await admin
    .from("launchpad_tokens")
    .select("id, name, ticker, logo_url, arc_launch_id, mint_address, created_at")
    .ilike("creator_wallet", address)
    .eq("chain", "arc")
    .in("status", ["active", "graduating", "graduated"])
    .order("created_at", { ascending: false });

  const tokens = (tokenRows ?? []) as {
    id:            string;
    name:          string;
    ticker:        string;
    logo_url:      string | null;
    arc_launch_id: string | null;
    mint_address:  string | null;
    created_at:    string;
  }[];

  if (tokens.length === 0) return json([]);

  // 2. claimed_usdc per token from DB
  const { data: claimRows } = await admin
    .from("creator_fee_claims")
    .select("token_id, amount_usdc")
    .eq("chain", "arc")
    .ilike("wallet", address)
    .in("token_id", tokens.map(t => t.id));

  const claimedByToken: Record<string, number> = {};
  for (const row of (claimRows ?? []) as { token_id: string; amount_usdc: string | null }[]) {
    claimedByToken[row.token_id] =
      (claimedByToken[row.token_id] ?? 0) + parseFloat(row.amount_usdc ?? "0");
  }

  // 3. creatorAccrued() on-chain in parallel
  const accruals = await Promise.all(
    tokens.map(t => {
      const curve = t.arc_launch_id;
      if (!curve?.startsWith("0x") || curve.length !== 42) return Promise.resolve(0n);
      // V2: arc_launch_id ≠ mint_address
      if (t.mint_address && curve.toLowerCase() === t.mint_address.toLowerCase()) return Promise.resolve(0n);
      return readUint256(curve, SEL_CREATOR_ACCRUED).catch(() => 0n);
    }),
  );

  // 4. Build response
  const result = tokens.map((t, i) => {
    const claimableBig  = accruals[i];
    const claimableUsdc = Number(claimableBig) / 1e18;
    const claimedUsdc   = claimedByToken[t.id] ?? 0;
    const earnedUsdc    = claimedUsdc + claimableUsdc;

    return {
      token_address:  t.mint_address ?? null,
      curve_address:  t.arc_launch_id ?? null,
      name:           t.name,
      symbol:         t.ticker,
      image:          t.logo_url,
      created_at:     t.created_at,
      earned_usdc:    earnedUsdc.toFixed(6),
      claimed_usdc:   claimedUsdc.toFixed(6),
      claimable_usdc: weiToDecStr(claimableBig),
    };
  });

  return json(result);
}

export const dynamic = "force-dynamic";
