import { createAdminClient } from "@/lib/supabase/server";

export const OCTO_PER_CREATION = 100;

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
export async function awardOcto(
  walletAddress: string,
  amount: number,
  type: "bet" | "task" | "referral",
  label: string,
): Promise<void> {
  const admin = createAdminClient() as any;

  // 1. Record the transaction
  await admin.from("octo_transactions").insert({
    id:             crypto.randomUUID(),
    wallet_address: walletAddress,
    type,
    amount,
    label,
  });

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
