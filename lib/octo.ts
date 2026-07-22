import { createAdminClient } from "@/lib/supabase/server";

export const OCTO_PER_BET      = 50;
export const OCTO_PER_CREATION = 100;

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
