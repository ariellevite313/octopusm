import type { Metadata } from "next";
import { getActiveMarketsUnified } from "@/services/prediction-service";
import { MarketsClient } from "@/components/market/markets-client";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Prediction Markets — OMdotfun",
  description: "Trade on the outcome of sports, crypto, and world events. Decentralized prediction markets on Solana powered by USDC and ClawdTrust.",
  alternates: { canonical: "https://omdot.fun/prediction" },
  openGraph: {
    title: "OMdotfun — Prediction Markets on Solana",
    description: "Trade on the outcome of sports, crypto, and world events. Decentralized prediction markets powered by USDC and ClawdTrust.",
    url: "https://omdot.fun/prediction",
    type: "website",
    images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: "OMdotfun" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "OMdotfun — Prediction Markets on Solana",
    description: "Trade on the outcome of sports, crypto, and world events.",
    images: ["/branding-logo.jpeg"],
  },
};

export default async function PredictionPage() {
  const markets = await getActiveMarketsUnified();
  return <MarketsClient initialMarkets={markets} />;
}
