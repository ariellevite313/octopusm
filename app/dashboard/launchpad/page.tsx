import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MyTokensSection } from "@/components/dashboard/my-tokens-section";
import { CreatorFeesDashboard } from "@/components/dashboard/creator-fees-dashboard";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const metadata: Metadata = {
  title: "My Tokens",
  robots: { index: false, follow: false },
};

export const revalidate = 0;

export default async function DashboardLaunchpadPage() {
  const wallet = await getWalletAddress();
  if (!wallet) redirect("/");

  return (
    <div className="space-y-10">
      {/* Creator fees overview */}
      <CreatorFeesDashboard walletAddress={wallet} />

      {/* Token list */}
      <MyTokensSection walletAddress={wallet} />
    </div>
  );
}
