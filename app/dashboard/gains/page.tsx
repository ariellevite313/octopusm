import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getDashboardData } from "@/services/dashboard-service";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { TokenBalances } from "@/components/dashboard/token-balances";
import { TradeGainsPanel } from "@/components/dashboard/trade-gains-panel";

export const metadata: Metadata = {
  title: "My Gains",
  robots: { index: false, follow: false },
};
export const revalidate = 0;

/** Onglet Gains : soldes OM (USDC, CLT, OMERO, avec historique et retrait) et gains sur les trades (posts, parrainage, cashback). */
export default async function GainsPage() {
  const wallet = await getWalletAddress();
  if (!wallet) redirect("/");
  const data = await getDashboardData(wallet);
  return (
    <div className="space-y-10">
      <TokenBalances
        usdcBalance={data.usdcBalance}
        cltBalance={data.cltBalance}
        octoBalance={data.octoBalance}
        usdcStats={data.usdcStats}
        cltStats={data.cltStats}
        octoStats={data.octoStats}
        usdcActivity={data.usdcActivity}
        cltActivity={data.cltActivity}
        octoActivity={data.octoActivity}
      />
      <TradeGainsPanel />
    </div>
  );
}
