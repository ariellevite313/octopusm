import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getDashboardData } from "@/services/dashboard-service";
import { ReferralSection } from "@/components/dashboard/referral-section";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const metadata: Metadata = {
  title: "My Referrals",
  robots: { index: false, follow: false },
};
export const revalidate = 0;

async function ReferralsContent({ wallet }: { wallet: string }) {
  const data = await getDashboardData(wallet);
  return (
    <ReferralSection
      referralCode={data.referralCode}
      referralCount={data.referralCount}
      referrals={data.referrals}
      octoEarned={data.octoStats.referral}
    />
  );
}

function ReferralsSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-5 space-y-4">
        <div className="h-4 w-32 rounded bg-muted/40 animate-pulse" />
        <div className="h-10 w-full rounded-xl bg-muted/40 animate-pulse" />
        <div className="h-4 w-48 rounded bg-muted/30 animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-muted/40 animate-pulse" />
            <div className="h-3.5 w-40 rounded bg-muted/30 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ReferralsPage() {
  const wallet = await getWalletAddress();
  if (!wallet) redirect("/");

  return (
    <div>
      <Suspense fallback={<ReferralsSkeleton />}>
        <ReferralsContent wallet={wallet} />
      </Suspense>
    </div>
  );
}
