import type { Metadata } from "next";
import { getActiveMarkets, getMarketVolumes, getDistinctCategories } from "@/services/prediction-service";
import { MarketGrid } from "@/components/market/market-grid";
import { CategoryNav } from "@/components/layout/category-nav";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Prediction Markets",
  description: "Trade on the outcome of sports, crypto, and world events. Decentralized prediction markets on Solana powered by USDC and ClawdTrust.",
  openGraph: {
    title: "Octo Market — Prediction Markets on Solana",
    description: "Trade on the outcome of sports, crypto, and world events. Decentralized prediction markets powered by USDC and ClawdTrust.",
    url: "/",
    type: "website",
    images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: "Octo Market" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Octo Market — Prediction Markets on Solana",
    description: "Trade on the outcome of sports, crypto, and world events.",
    images: ["/branding-logo.jpeg"],
  },
};

export default async function HomePage() {
  const [markets, volumes, categories] = await Promise.all([
    getActiveMarkets(),
    getMarketVolumes(),
    getDistinctCategories(),
  ]);

  return (
    <>
      <CategoryNav categories={categories} active="all" />
      <div className="mx-auto max-w-7xl px-4 py-10">
        {markets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="text-5xl">🐙</span>
            <p className="text-muted-foreground">No active markets right now.</p>
          </div>
        ) : (
          <MarketGrid markets={markets} volumes={volumes} showCategoryTabs={false} />
        )}
      </div>
    </>
  );
}
