import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getActiveMarketsByCategory,
  getDistinctCategories,
  getMarketVolumes,
} from "@/services/prediction-service";
import { MarketGrid } from "@/components/market/market-grid";

export const revalidate = 60;

// Empêche la route [category] de capturer les segments réservés
const RESERVED = ["admin", "dashboard", "crypto", "pools", "leaderboard", "launch", "archive", "prediction", "api"];

type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const cap = category.charAt(0).toUpperCase() + category.slice(1);
  return {
    title: `${cap} Markets | OMdotfun`,
    description: `Prediction markets in the ${cap} category.`,
  };
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params;

  if (RESERVED.includes(category)) notFound();

  const [markets, volumes, allCategories] = await Promise.all([
    getActiveMarketsByCategory(category),
    getMarketVolumes(),
    getDistinctCategories(),
  ]);

  // Catégorie inconnue → 404
  if (!allCategories.includes(category)) notFound();

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-10">
        {markets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="text-5xl">🐙</span>
            <p className="text-muted-foreground">No active markets in this category.</p>
          </div>
        ) : (
          <MarketGrid markets={markets} volumes={volumes} showCategoryTabs={false} />
        )}
      </div>
    </>
  );
}
