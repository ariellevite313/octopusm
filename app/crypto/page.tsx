import type { Metadata } from "next";
import { getActiveMarkets, getMarketVolumes, getDistinctCategories } from "@/services/prediction-service";
import { CryptoPageClient } from "@/components/updown/crypto-page-client";
import { CategoryNav } from "@/components/layout/category-nav";

export const metadata: Metadata = {
  title: "Crypto Markets | Octo Market",
  description: "Up/Down rounds and Hit Price prediction markets on crypto.",
  robots: { index: true, follow: true },
};
export const revalidate = 60;

export default async function CryptoPage() {
  const [allMarkets, volumes, categories] = await Promise.all([
    getActiveMarkets(),
    getMarketVolumes(),
    getDistinctCategories(),
  ]);

  // Hit Price = marchés prédiction crypto (category_id === "crypto")
  // Les Up/Down sont dans updown_markets, pas ici
  const hitPriceMarkets = allMarkets.filter((m) => m.category_id === "crypto");

  return (
    <>
      <CategoryNav categories={categories} active="crypto" />
      <CryptoPageClient hitPriceMarkets={hitPriceMarkets} volumes={volumes} />
    </>
  );
}
