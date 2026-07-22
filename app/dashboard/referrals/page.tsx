import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getDashboardData } from "@/services/dashboard-service";
import { ReferralSection } from "@/components/dashboard/referral-section";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const metadata: Metadata = {
  title: "My Referrals",
  robots: { index: false, follow: false },
};
export const revalidate = 0;

export default async function ReferralsPage() {
  const wallet = await getWalletAddress();
  if (!wallet) redirect("/");

  const data = await getDashboardData(wallet);

  return (
    <div>
      <ReferralSection
        referralCode={data.referralCode}
        referralCount={data.referralCount}
        referrals={data.referrals}
        octoEarned={data.octoStats.referral}
      />
    </div>
  );
}
