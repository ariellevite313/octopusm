import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { LeaderboardTabs } from "@/components/leaderboard/leaderboard-tabs";
import { Tr } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Top predictors ranked by gains on OMdotfun.",
};

export default function PredictionsLeaderboardPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">

      {/* Back */}
      <Link
        href="/prediction"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        <Tr>Markets</Tr>
      </Link>

      {/* Title */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Trophy className="size-6 shrink-0 text-foreground" />
          <h1 className="whitespace-nowrap text-[clamp(18px,5.4vw,26px)] font-bold leading-tight tracking-tight text-foreground"><Tr>Predictions Leaderboard</Tr></h1>
        </div>
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-muted-foreground">
          <Tr>Top 100</Tr>
        </span>
      </div>

      <LeaderboardTabs />

    </main>
  );
}
