import type { Metadata } from "next";
import { Providers } from "@/providers/providers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CategoryNavWrapper } from "@/components/layout/category-nav-wrapper";
import { RefCapture } from "@/components/layout/ref-capture";
import { getDistinctCategories } from "@/services/prediction-service";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://omdot.fun";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "OMdotfun",
    template: "%s — OMdotfun",
  },
  description: "Decentralized prediction markets on Solana. Predict on sports, crypto, and world events with USDC or ClawdTrust.",
  keywords: ["prediction market", "solana", "crypto prediction", "pari mutuel", "USDC", "web3"],
  authors: [{ name: "OMdotfun" }],
  creator: "OMdotfun",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "OMdotfun",
    title: "OMdotfun",
    description: "Decentralized prediction markets on Solana. Predict on sports, crypto, and world events with USDC or ClawdTrust.",
    images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: "OMdotfun" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "OMdotfun",
    description: "Decentralized prediction markets on Solana.",
    images: ["/branding-logo.jpeg"],
  },
  icons: { icon: "/og-logo.png", apple: "/og-logo.png" },
  robots: { index: true, follow: true },
  alternates: { canonical: SITE_URL },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await getDistinctCategories();

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <RefCapture />
          <div className="flex min-h-screen flex-col">
            <Header />
            <CategoryNavWrapper categories={categories} />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
