import type { Metadata } from "next";
import { LiveScores } from "@/components/sports/live-scores";

export const metadata: Metadata = { title: "Live scores", description: "Live football scores on OMdotfun." };

export default function LivePage() {
  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-6 lg:max-w-6xl lg:px-8">
      <LiveScores />
    </div>
  );
}
