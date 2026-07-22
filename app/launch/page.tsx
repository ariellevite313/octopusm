import type { Metadata } from "next";
import { LaunchStudio } from "@/components/launch/launch-studio";

export const metadata: Metadata = {
  title: "Launch — OMdotfun",
  description:
    "Launch a Solana token from OMdotfun with a verified fee payment and direct Bags.fm submission.",
};

export default function LaunchPage() {
  return (
    <main className="min-h-screen">
      <LaunchStudio />
    </main>
  );
}
