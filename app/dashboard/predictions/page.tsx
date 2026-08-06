import { Suspense } from "react";
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

async function PredictionsContent({ wallet }: { wallet: string }) {
  const data = await getDashboardData(wallet);
  return <BetHistory bets={data.bets} walletAddress={wallet} />;
}

function PredictionsSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="size-8 rounded-full bg-muted/40 animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-40 rounded bg-muted/40 animate-pulse" />
            <div className="h-2.5 w-24 rounded bg-muted/30 animate-pulse" />
          </div>
          <div className="h-6 w-20 rounded-xl bg-muted/40 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export default async function PredictionsPage() {
  const wallet = await getWalletAddress();
  if (!wallet) redirect("/");

  return (
    <div>
      <Suspense fallback={<PredictionsSkeleton />}>
        <PredictionsContent wallet={wallet} />
      </Suspense>
    </div>
  );
}
