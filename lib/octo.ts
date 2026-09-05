import { createAdminClient } from "@/lib/supabase/server";

export const OCTO_PER_CREATION = 100;
export const OMERO_PER_LAUNCH  = 500;

/**
 * OCTO earned for a bet, based on amount:
 *  USDC : 10 OCTO per 2 USDC  → floor(amount / 2) * 10
 *  CLT  : 20 OCTO per 100 000 CLT → floor(amount / 100_000) * 20
 * Minimum 0 (returns 0 if amount is too small).
 */
export function octoForBet(amount: number, token: string): number {
  const isClt = token === "clawdtrust" || token === "clt";
  if (isClt) return Math.floor(amount / 100_000) * 20;
  return Math.floor(amount / 2) * 10;
}

/**
 * Awards OCTO to a wallet:
 *  1. Inserts a row in `octo_transactions` (activity history)
 *  2. Upserts `leaderboard_octo` to reflect the new balance
 *
 * Never throws — errors are swallowed so they don't affect the caller's response.
 * Call with `.catch(() => {})` or fire-and-forget via void.
 */
/** 100 OMERO per 0.01 SOL bought (buy direction only). Returns 0 if below threshold. */
export function omeroForSwap(lamports: number): number {
  const sol = lamports / 1e9;
  return Math.min(10_000, Math.floor(sol / 0.01) * 100);
}

export async function awardOcto(
  walletAddress: string,
  amount: number,
  type: "bet" | "task" | "referral" | "launch" | "swap",
  _label?: string,
  betAmountUsd?: number,
): Promise<void> {
  if (amount <= 0) return;

  const admin = createAdminClient() as any;

  // 1. Record the transaction (no `label` column — table uses `type` for display)
  const row: Record<string, unknown> = {
    wallet_address: walletAddress,
    type,
    amount,
    label: _label ?? "",
  };
  if (betAmountUsd !== undefined) row.bet_amount_usd = betAmountUsd;

  await admin.from("octo_transactions").insert(row);

  // 2. Increment leaderboard balance (read → upsert; good enough at current scale)
  const { data: lb } = await admin
    .from("leaderboard_octo")
    .select("total_octo")
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  const current = Number(lb?.total_octo ?? 0);
  await admin.from("leaderboard_octo").upsert(
    { wallet_address: walletAddress, total_octo: current + amount },
    { onConflict: "wallet_address" },
  );
}
