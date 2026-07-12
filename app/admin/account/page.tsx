import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/services/admin-service";
import { getDashboardData } from "@/services/dashboard-service";
import { TokenBalances } from "@/components/dashboard/token-balances";
import { BetHistory } from "@/components/dashboard/bet-history";
import { TasksSection } from "@/components/dashboard/tasks-section";
import { ReferralSection } from "@/components/dashboard/referral-section";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";

export const metadata: Metadata = { title: "My account - Admin" };
export const revalidate = 0;

export default async function AdminAccountPage() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) redirect("/");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const wallet = user?.user_metadata?.wallet_address as string | undefined;
  if (!wallet) redirect("/");

  const data = await getDashboardData(wallet);

  const totalBets = data.bets.length;
  const wins = data.bets.filter(
    (b) => b.result_status === "win" || b.result_status === "claimed" || b.result_status === "paid"
  ).length;

  const displayLabel =
    data.wallet?.display_name ?? data.wallet?.username ?? `${wallet.slice(0, 6)}...${wallet.slice(-6)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {data.wallet?.avatar_src ? (
          <Image
            src={data.wallet.avatar_src}
            alt="avatar"
            width={44}
            height={44}
            unoptimized
            className="rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <span className="text-base font-bold text-orange-500">
              {displayLabel.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-foreground truncate">{displayLabel}</h1>
            <OctoBadge totalOcto={data.octoBalance} size={14} />
          </div>
          <p className="text-xs font-mono text-muted-foreground">{wallet.slice(0, 6)}...{wallet.slice(-6)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wins</p>
          <p className="text-xl font-bold text-orange-500">
            {wins}<span className="text-sm font-normal text-muted-foreground ml-1">/ {totalBets}</span>
          </p>
        </div>
      </div>

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

      <BetHistory bets={data.bets} walletAddress={wallet} />
      <TasksSection tasks={data.tasks} walletAddress={wallet} />
      <ReferralSection
        referralCode={data.referralCode}
        referralCount={data.referralCount}
        referrals={data.referrals}
      />
    </div>
  );
}
