import type { Metadata } from "next";
import { PolymarketHome } from "@/components/market/polymarket-home";

export const metadata: Metadata = {
  title: "Polymarket news",
  description: "Featured events, trending topics and live markets from Polymarket.",
  alternates: { canonical: "https://omdot.fun/polymarket" },
};

export default function PolymarketPage() {
  return <PolymarketHome />;
}
