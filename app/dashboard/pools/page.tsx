import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MyPoolsSection } from "@/components/dashboard/my-pools-section";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const metadata: Metadata = {
  title: "My Pools",
  robots: { index: false, follow: false },
};
export const revalidate = 0;

export default async function PoolsPage() {
  const wallet = await getWalletAddress();
  if (!wallet) redirect("/");

  return (
    <div>
      <MyPoolsSection walletAddress={wallet} />
    </div>
  );
}
