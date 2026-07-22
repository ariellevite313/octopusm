import { createAdminClient } from "@/lib/supabase/server";

/** 1% of the bet amount goes to the referrer as commission */
export const REFERRAL_COMMISSION_RATE = 0.01;

/**
 * Awards a referral commission to the wallet that referred `walletAddress`.
 *
 * Flow:
 *  1. Look up whether `walletAddress` was referred by someone (referrals table)
 *  2. If a referrer exists, insert a row in referral_commissions
 *
 * Never throws — errors are swallowed so they don't affect the caller's response.
 * Call fire-and-forget: awardReferralCommission(...).catch(() => {})
 */
export async function awardReferralCommission(
  walletAddress: string,
  amount: number,
  token: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Find the referrer (if any)
  const { data: referral } = await admin
    .from("referrals")
    .select("referrer_wallet")
    .eq("referred_wallet", walletAddress)
    .maybeSingle();

  const referrerWallet: string | null = referral?.referrer_wallet ?? null;
  if (!referrerWallet) return;

  // 2. Compute commission (round to 6 decimal places)
  const commission = Math.round(amount * REFERRAL_COMMISSION_RATE * 1_000_000) / 1_000_000;
  if (commission <= 0) return;

  const isClt = token === "clawdtrust" || token === "clt";

  await admin.from("referral_commissions").insert({
    referrer_wallet: referrerWallet,
    referred_wallet: walletAddress,
    amount_usdc:     isClt ? 0 : commission,
    amount_clt:      isClt ? commission : 0,
  });
}
