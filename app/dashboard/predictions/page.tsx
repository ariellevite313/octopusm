import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getDashboardData } from "@/services/dashboard-service";
import { BetHistory } from "@/components/dashboard/bet-history";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const metadata: Metadata = {
  title: "My Predictions",
  robots: { index: false, follow: false },
};
export const revalidate = 0;

export default async function PredictionsPage() {
  const wallet = await getWalletAddress();
  if (!wallet) redirect("/");

  const data = await getDashboardData(wallet);

  return (
    <div>
      <BetHistory bets={data.bets} walletAddress={wallet} />
    </div>
  );
}
