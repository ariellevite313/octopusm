import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MyTokensSection } from "@/components/dashboard/my-tokens-section";
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
    <div>
      <MyTokensSection walletAddress={wallet} />
    </div>
  );
}
