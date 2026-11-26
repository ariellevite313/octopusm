import { redirect } from "next/navigation";
import { getDashboardData } from "@/services/dashboard-service";
import { WalletHome } from "@/components/dashboard/wallet-home";
import { DashboardBottomNavSwitch } from "@/components/layout/dashboard-bottom-nav-switch";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const revalidate = 0;

function fmtAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const wallet = await getWalletAddress();
  if (!wallet) redirect("/");

  const data = await getDashboardData(wallet);

  const avatarSrc = data.wallet?.avatar_src ?? null;
  const displayLabel =
    data.wallet?.display_name ?? data.wallet?.username ?? fmtAddr(wallet);

  return (
    <>
      <div className="mx-auto max-w-2xl px-4 py-6 pb-40 md:pb-24 space-y-6">
        {/* En-tête unifié : wallet, prédictions et lancements */}
        {/* En mode cartes (téléphone), le contenu de la page s'ouvre avec son bouton */}
        <WalletHome wallet={wallet} name={displayLabel} avatar={avatarSrc} octo={data.octoBalance}>{children}</WalletHome>
      </div>
      <DashboardBottomNavSwitch />
    </>
  );
}
