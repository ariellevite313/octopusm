/**
 * GET /api/v1/creators/{address}/summary
 *
 * Accepts either a Solana base58 address OR an Arc EVM 0x address.
 * Returns an array (one entry per currency found), or a single object.
 *
 * Solana: earnings are in SOL (from Meteora DBC creatorQuoteFee).
 * Arc:    earnings are in USDC (from BondingCurveArcV2.creatorAccrued()).
 *
 * Amounts are decimal strings in whole units — never lamports or wei.
 * Unknown address → 200 with zeros. Invalid → 400.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { createAdminClient }     from "@/lib/supabase/server";
import {
  detectAddrType, json, err, corsOk, checkRateLimit, getIp,
  readUint256, SEL_CREATOR_ACCRUED, weiToDecStr, lamportsToSol,
} from "@/lib/v1/helpers";

export async function OPTIONS() { return corsOk(); }

// ── helpers ───────────────────────────────────────────────────────────────────

function getSolanaConnection() {
  return new Connection(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
}

async function getSolanaClaimable(poolAddresses: string[]): Promise<number> {
  if (poolAddresses.length === 0) return 0;
  try {
    const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DBC = (sdk as any).DynamicBondingCurveClient;
    const client = new DBC(getSolanaConnection(), "confirmed");
    let total = 0;
    await Promise.all(
      poolAddresses.map(async (addr) => {
        try {
          const pool = new PublicKey(addr);
          const state = await client.state.getPool(pool);
          const inner = state?.poolState ?? state;
          const rawQ  = inner?.creatorQuoteFee;
          if (!rawQ) return;
          const lam = typeof rawQ === "object" && rawQ?.toNumber
            ? rawQ.toNumber()
            : typeof rawQ === "number" ? rawQ : parseInt(String(rawQ), 10);
          total += isNaN(lam) ? 0 : lam;
        } catch { /* skip */ }
      }),
    );
    return total; // in lamports
  } catch { return 0; }
}

// ── handler ───────────────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: { address: string } },
) {
  if (!checkRateLimit(getIp(req))) return err("Too Many Requests", 429);

  const raw     = params.address;
  const addrType = detectAddrType(raw);
  if (addrType === "invalid") return err("Invalid address (expected Solana base58 or Arc 0x)", 400);

  const address = addrType === "evm" ? raw.toLowerCase() : raw;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── Solana path ──────────────────────────────────────────────────────────
  if (addrType === "solana") {
    const { data: tokenRows } = await admin
      .from("launchpad_tokens")
      .select("id, pool_address")
      .eq("creator_wallet", address)
      .or("chain.eq.solana,chain.is.null")
      .in("status", ["active", "graduating", "graduated"]);

    const tokens = (tokenRows ?? []) as { id: string; pool_address: string | null }[];
    const poolAddresses = tokens.map(t => t.pool_address).filter(Boolean) as string[];

    const [claimableLamports, claimRows] = await Promise.all([
      getSolanaClaimable(poolAddresses),
      admin
        .from("creator_fee_claims")
        .select("amount_sol")
        .or("chain.eq.solana,chain.is.null")
        .eq("wallet", address),
    ]);

    const claimedSol = ((claimRows.data ?? []) as { amount_sol: string | null }[])
      .reduce((s, r) => s + parseFloat(r.amount_sol ?? "0"), 0);

    const claimableSol = claimableLamports / 1e9;
    const earnedSol    = claimedSol + claimableSol;

    return json({
      address,
      tokens:      tokens.length,
      earned_total: earnedSol.toFixed(9).replace(/\.?0+$/, "") || "0",
      claimed:      claimedSol.toFixed(9).replace(/\.?0+$/, "") || "0",
      claimable:    lamportsToSol(claimableLamports),
      currency:     "SOL",
      updated_at:   new Date().toISOString(),
    });
  }

  // ── Arc path ─────────────────────────────────────────────────────────────
  const { data: tokenRows } = await admin
    .from("launchpad_tokens")
    .select("id, arc_launch_id")
    .ilike("creator_wallet", address)
    .eq("chain", "arc")
    .in("status", ["active", "graduating", "graduated"]);

  const tokens = (tokenRows ?? []) as { id: string; arc_launch_id: string | null }[];
  const v2Tokens = tokens.filter(t => t.arc_launch_id?.startsWith("0x") && t.arc_launch_id.length === 42);

  const accruals = await Promise.all(
    v2Tokens.map(t => readUint256(t.arc_launch_id!, SEL_CREATOR_ACCRUED).catch(() => 0n)),
  );
  const claimableBig = accruals.reduce((s, v) => s + v, 0n);

  const { data: claimRows } = await admin
    .from("creator_fee_claims")
    .select("amount_usdc")
    .eq("chain", "arc")
    .ilike("wallet", address);

  const claimedUsdc = ((claimRows ?? []) as { amount_usdc: string | null }[])
    .reduce((s, r) => s + parseFloat(r.amount_usdc ?? "0"), 0);

  const claimableUsdc = Number(claimableBig) / 1e18;

  return json({
    address,
    tokens:      tokens.length,
    earned_total: (claimedUsdc + claimableUsdc).toFixed(6),
    claimed:      claimedUsdc.toFixed(6),
    claimable:    weiToDecStr(claimableBig),
    currency:     "USDC",
    updated_at:   new Date().toISOString(),
  });
}

export const dynamic = "force-dynamic";
