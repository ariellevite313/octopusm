import type { Metadata } from "next";
import { CreatorLeaderboard } from "@/components/leaderboard/creator-leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard — OMdotfun",
  description: "Top token creators ranked by fees earned on OMdotfun.",
};

export default function LeaderboardPage() {
  return <CreatorLeaderboard />;
}
