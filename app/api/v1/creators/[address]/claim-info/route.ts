/**
 * GET /api/v1/creators/{address}/claim-info?token=<curve_address>&recipient=<0x…>
 *
 * Returns the calldata needed for the Aido app to claim creator fees on-chain.
 * No private key is involved — the app signs & sends the tx itself.
 *
 * Query params:
 *   token      — BondingCurveArcV2 clone address (curve_address from /tokens)
 *   recipient  — (optional) address that receives the USDC.
 *                Defaults to {address} (the creator).
 *                Pass a vault address here to redirect fees to an Aido vault.
 *
 * Response:
 * {
 *   "contract":      "0x…",              // BondingCurveArcV2 clone
 *   "function":      "claimCreatorFees(address)",
 *   "args":          ["0x<recipient>"],
 *   "calldata":      "0xeedf4b4e000…",   // ready to use as tx.data
 *   "chain_id":      5042,
 *   "value":         "0",               // no ETH needed
 *   "claimable_usdc": "2.34",
 *   "recipient":     "0x…",
 *   "note": "Payment goes to `recipient`. Pass your vault address to redirect fees."
 * }
 *
 * Dividend claim-info: pass ?type=dividend&token=<OM_token_address>
 * {
 *   "contract":   "0x…",              // OMToken address
 *   "function":   "claimDividend()",
 *   "args":       [],
 *   "calldata":   "0x9f678cca",
 *   "chain_id":   5042,
 *   "value":      "0",
 *   "claimable_usdc": "0.001234",
 *   "note": "Dividend is always sent to msg.sender — vault redirection not possible here."
 * }
 */

import { createAdminClient }          from "@/lib/supabase/server";
import {
  isValidEvm, json, err, corsOk, checkRateLimit, getIp,
  readUint256, readUint256WithAddr,
  SEL_CREATOR_ACCRUED, SEL_PENDING_DIVIDEND,
  SEL_CLAIM_CREATOR_FEES, SEL_CLAIM_DIVIDEND,
  weiToDecStr,
} from "@/lib/v1/helpers";

const CHAIN_ID = 5042;

/** ABI-encode a single address argument (32-byte padded). */
function encodeAddress(addr: string): string {
  return addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

export async function OPTIONS() { return corsOk(); }

export async function GET(
  req: Request,
  { params }: { params: { address: string } },
) {
  if (!checkRateLimit(getIp(req))) return err("Too Many Requests", 429);

  const creatorAddress = params.address.toLowerCase();
  if (!isValidEvm(creatorAddress)) return err("Invalid Arc address", 400);

  const { searchParams } = new URL(req.url);
  const tokenParam     = searchParams.get("token")?.toLowerCase() ?? "";
  const recipientParam = searchParams.get("recipient")?.toLowerCase() ?? creatorAddress;
  const claimType      = searchParams.get("type") ?? "creator"; // "creator" | "dividend"

  if (!tokenParam) return err("Missing query param: token", 400);
  if (!isValidEvm(tokenParam)) return err("Invalid token address", 400);
  if (!isValidEvm(recipientParam)) return err("Invalid recipient address", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  if (claimType === "dividend") {
    // ── Dividend: OMToken.claimDividend() ──────────────────────────────────
    // Verify the token exists in DB
    const { data: tokenRow } = await admin
      .from("launchpad_tokens")
      .select("id")
      .ilike("mint_address", tokenParam)
      .eq("chain", "arc")
      .maybeSingle();

    if (!tokenRow) return err("Token not found", 404);

    const pendingBig = await readUint256WithAddr(
      tokenParam,
      SEL_PENDING_DIVIDEND,
      creatorAddress,
    ).catch(() => 0n);

    return json({
      contract:       tokenParam,
      function:       "claimDividend()",
      args:           [],
      calldata:       SEL_CLAIM_DIVIDEND,
      chain_id:       CHAIN_ID,
      value:          "0",
      claimable_usdc: weiToDecStr(pendingBig),
      note:           "Dividend is always sent to msg.sender — vault redirection is not possible for dividends.",
    });
  }

  // ── Creator fees: BondingCurveArcV2.claimCreatorFees(address to) ──────────

  // Verify this curve belongs to the creator
  const { data: tokenRow } = await admin
    .from("launchpad_tokens")
    .select("id")
    .ilike("arc_launch_id", tokenParam)
    .ilike("creator_wallet", creatorAddress)
    .eq("chain", "arc")
    .maybeSingle();

  if (!tokenRow) {
    return err("Token not found or not owned by this creator", 404);
  }

  const claimableBig = await readUint256(tokenParam, SEL_CREATOR_ACCRUED).catch(() => 0n);

  // calldata = selector + padded recipient address
  const calldata = SEL_CLAIM_CREATOR_FEES + encodeAddress(recipientParam);

  return json({
    contract:       tokenParam,
    function:       "claimCreatorFees(address)",
    args:           [recipientParam],
    calldata,
    chain_id:       CHAIN_ID,
    value:          "0",
    claimable_usdc: weiToDecStr(claimableBig),
    recipient:      recipientParam,
    note:           "USDC is sent to `recipient`. Pass your vault address to redirect fees to Aido.",
  });
}

export const dynamic = "force-dynamic";
