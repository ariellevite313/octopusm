import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { BagsPanel } from "@/components/dashboard/bags-panel";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { getDashboardData } from "@/services/dashboard-service";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};
export const revalidate = 0;

/** Onglet Tokens du dashboard unifié : les actifs du wallet (ClawdTrust en premier). */
export default async function DashboardPage() {
  const wallet = await getWalletAddress();
  if (!wallet) redirect("/");
  const data = await getDashboardData(wallet);
  return <BagsPanel embedded octo={data.octoBalance} />;
}
