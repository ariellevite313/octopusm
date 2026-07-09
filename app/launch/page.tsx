import type { Metadata } from "next";
import { LaunchStudio } from "@/components/launch/launch-studio";

export const metadata: Metadata = {
  title: "Launch — Octo Market",
  description:
    "Launch a Solana token from Octo Market with a verified fee payment and direct Bags.fm submission.",
};

export default function LaunchPage() {
  return (
    <main className="min-h-screen">
      <LaunchStudio />
    </main>
  );
}
