import type { Metadata } from "next";
import { CreatorLeaderboard } from "@/components/leaderboard/creator-leaderboard";

export const metadata: Metadata = {
  title: "Creator Leaderboard — OMdotfun",
  description: "Top token creators ranked by fees earned on OMdotfun.",
};

export default function LaunchpadLeaderboardPage() {
  return <CreatorLeaderboard />;
}
