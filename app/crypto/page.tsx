import type { Metadata } from "next";
import { getActiveMarketsUnified } from "@/services/prediction-service";
import { MarketsClient } from "@/components/market/markets-client";

export const metadata: Metadata = {
  title: "Crypto Markets | OMdotfun",
  description: "Crypto prediction markets on OMdotfun.",
  robots: { index: true, follow: true },
};
export const revalidate = 60;

export default async function CryptoPage() {
  const markets = await getActiveMarketsUnified("crypto");
  return <MarketsClient category="crypto" initialMarkets={markets} />;
}
