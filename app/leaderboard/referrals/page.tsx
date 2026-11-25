import type { Metadata } from "next";
import { ReferralBoard } from "@/components/leaderboard/referral-board";

export const metadata: Metadata = { title: "Top referrers", description: "The 20 best referrers on OMdotfun." };

export default function ReferralLeaderboardPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 lg:py-10">
      <ReferralBoard />
    </main>
  );
}
