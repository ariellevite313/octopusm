import type { Metadata } from "next";
import { LeaderboardView } from "@/components/hackathon/leaderboard-view";

export const metadata: Metadata = { title: "Hackathon leaderboard" };
export default function Page() { return <LeaderboardView />; }
