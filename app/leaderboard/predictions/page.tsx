import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { LeaderboardTabs } from "@/components/leaderboard/leaderboard-tabs";

export const metadata: Metadata = {
  title: "Leaderboard — OMdotfun",
  description: "Top predictors ranked by gains on OMdotfun.",
};

export default function PredictionsLeaderboardPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">

      {/* Back */}
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Markets
      </Link>

      {/* Title */}
      <div className="mb-6 flex items-center gap-2">
        <Trophy className="size-5 text-amber-400" />
        <h1 className="text-xl font-bold text-foreground">Predictions Leaderboard</h1>
      </div>

      <LeaderboardTabs />

    </main>
  );
}
