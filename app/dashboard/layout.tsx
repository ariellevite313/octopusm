import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDashboardData } from "@/services/dashboard-service";
import { TokenBalances } from "@/components/dashboard/token-balances";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { BottomNavWrapper } from "@/components/layout/bottom-nav-wrapper";
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
      <div className="mx-auto max-w-2xl px-4 py-10 pb-20 md:pb-10 space-y-6">
        {/* Back to Home */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Markets
        </Link>

        {/* Identity */}
        <div className="flex items-center gap-4">
          {avatarSrc ? (
            <Image
              src={avatarSrc}
              alt="avatar"
              width={48}
              height={48}
              unoptimized
              className="rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
              <span className="text-lg font-bold text-orange-500">
                {displayLabel.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-foreground truncate">{displayLabel}</h1>
              <OctoBadge totalOcto={data.octoBalance} size={14} />
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">{fmtAddr(wallet)}</p>
          </div>
        </div>

        {/* Balances */}
        <section>
          <h2 className="mb-3 text-base font-bold text-foreground">Balances</h2>
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
        </section>

        {/* Desktop tabs */}
        <DashboardTabs />

        {/* Sub-page content */}
        {children}
      </div>
      <BottomNavWrapper />
    </>
  );
}
