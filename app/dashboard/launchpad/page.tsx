import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CreatorFeesDashboard } from "@/components/dashboard/creator-fees-dashboard";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Tokens",
  robots: { index: false, follow: false },
};

export const revalidate = 0;

export default async function DashboardLaunchpadPage() {
  const wallet = await getWalletAddress();
  if (!wallet) redirect("/");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("wallets")
    .select("display_name, username, avatar_src")
    .eq("address", wallet)
    .maybeSingle();
  const p = profile as { display_name?: string | null; username?: string | null; avatar_src?: string | null } | null;

  return (
    <div className="space-y-10">
      <CreatorFeesDashboard
        walletAddress={wallet}
        displayName={p?.display_name ?? p?.username ?? null}
        avatarSrc={p?.avatar_src ?? null}
      />
    </div>
  );
}
