import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { LeaderboardTabs } from "@/components/leaderboard/leaderboard-tabs";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Top winners on OMdotfun. Best USDC, CLT and Omeru Inu earners on Solana prediction markets.",
  openGraph: {
    title: "OMdotfun — Leaderboard",
    description: "Top winners ranked by gains on Solana prediction markets.",
    url: "/leaderboard",
    type: "website",
    images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: "OMdotfun" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "OMdotfun — Leaderboard",
    description: "Top winners ranked by gains.",
    images: ["/branding-logo.jpeg"],
  },
  alternates: { canonical: "https://omdot.fun/leaderboard" },
};

export const revalidate = 3600;

export default function LeaderboardPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">

      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Trophy className="size-9 shrink-0 text-amber-500 md:size-16" />
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-6xl">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">Best winners on OMdotfun</p>
        </div>
      </div>

      <LeaderboardTabs />

    </div>
  );
}
