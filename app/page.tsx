import type { Metadata } from "next";
import { FeedPage } from "@/components/social/feed-page";

// L'accueil est le fil (posts, tokens, prédictions de la communauté)
export const metadata: Metadata = {
  title: { absolute: "OMdotfun | The crypto social feed: tokens & predictions" },
  description: "Post, trade and predict in one feed. Launch tokens and play prediction markets on Solana and Arc.",
  alternates: { canonical: "https://omdot.fun" },
  openGraph: {
    title: "OMdotfun | The crypto social feed",
    description: "Post, trade and predict in one feed. Launch tokens and play prediction markets on Solana and Arc.",
    url: "https://omdot.fun",
    siteName: "OMdotfun",
    type: "website",
    images: [{ url: "/og-omdot.png", width: 1200, height: 630, alt: "OMdotfun" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "OMdotfun | The crypto social feed",
    description: "Post, trade and predict in one feed. Launch tokens and play prediction markets on Solana and Arc.",
    images: ["/og-omdot.png"],
  },
};

export default function HomePage() {
  return <FeedPage />;
}
