import type { Metadata } from "next";
import { LaunchStudio } from "@/components/launch/launch-studio";

export const metadata: Metadata = {
  title: "Launch — OMdotfun",
  description: "Launch a Solana token from OMdotfun with a verified fee payment and direct Bags.fm submission.",
  alternates: { canonical: "https://omdot.fun/launch" },
  openGraph: {
    title: "Launch a Token | OMdotfun",
    description: "Launch a Solana token from OMdotfun with a verified fee payment and direct Bags.fm submission.",
    url: "https://omdot.fun/launch",
    type: "website",
    images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: "OMdotfun Launch" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Launch a Token | OMdotfun",
    description: "Launch a Solana token from OMdotfun.",
    images: ["/branding-logo.jpeg"],
  },
};

export default function LaunchPage() {
  return (
    <main className="min-h-screen">
      <LaunchStudio />
    </main>
  );
}
