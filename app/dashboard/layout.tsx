import { redirect } from "next/navigation";
import { getDashboardData } from "@/services/dashboard-service";
import { BalancesSection } from "@/components/dashboard/balances-section";
import { OctoBadgeSection } from "@/components/dashboard/octo-badge-section";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { DashboardBottomNavSwitch } from "@/components/layout/dashboard-bottom-nav-switch";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { HideOnLaunchpad } from "@/components/dashboard/hide-on-launchpad";
import { DashboardAvatar } from "@/components/dashboard/dashboard-avatar";

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
      <div className="mx-auto max-w-2xl px-4 py-10 pb-28 md:pb-10 space-y-6">
        {/* Identity */}
        <HideOnLaunchpad>
        <div className="flex items-center gap-4">
          {avatarSrc ? (
            <DashboardAvatar src={avatarSrc} />
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <span className="text-2xl font-bold text-primary">
                {displayLabel.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[26px] font-bold tracking-tight text-foreground truncate">{displayLabel}</h1>
              <OctoBadgeSection totalOcto={data.octoBalance} size={14} />
            </div>
            <p className="text-sm font-mono text-muted-foreground mt-0.5">{fmtAddr(wallet)}</p>
          </div>
        </div>
        </HideOnLaunchpad>

        {/* Balances — hidden on launchpad dashboard */}
        <BalancesSection
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

        {/* Desktop tabs */}
        <DashboardTabs />

        {/* Sub-page content */}
        {children}
      </div>
      <DashboardBottomNavSwitch />
    </>
  );
}
