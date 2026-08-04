import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveMarketsUnified } from "@/services/prediction-service";
import { MarketsClient } from "@/components/market/markets-client";

export const revalidate = 60;

// Empêche la route [category] de capturer les segments réservés
const RESERVED = ["admin", "dashboard", "pools", "leaderboard", "launch", "archive", "prediction", "api"];

type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const cap = category.charAt(0).toUpperCase() + category.slice(1);
  const description = `Prediction markets in the ${cap} category on OMdotfun.`;
  return {
    title: `${cap} Markets | OMdotfun`,
    description,
    alternates: { canonical: `https://omdot.fun/${category}` },
    openGraph: {
      title: `${cap} Prediction Markets | OMdotfun`,
      description,
      url: `https://omdot.fun/${category}`,
      type: "website",
      images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: `${cap} Markets` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${cap} Prediction Markets | OMdotfun`,
      description,
      images: ["/branding-logo.jpeg"],
    },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params;

  if (RESERVED.includes(category)) notFound();

  // Requête rapide (index sur category_id) — ne bloque pas le rendu
  const markets = await getActiveMarketsUnified(category);

  // Les volumes sont chargés côté client en arrière-plan via /api/markets
  return <MarketsClient category={category} initialMarkets={markets} />;
}
