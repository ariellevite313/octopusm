import type { Metadata, Viewport } from "next";
import { Providers } from "@/providers/providers";
import { HeaderSwitch } from "@/components/layout/header-switch";
import { Footer } from "@/components/layout/footer";
import { CategoryNavWrapper } from "@/components/layout/category-nav-wrapper";
import { RefCapture } from "@/components/layout/ref-capture";
import { RootBottomNav } from "@/components/layout/root-bottom-nav";
import { DesktopSidebar } from "@/components/desktop/desktop-sidebar";
import { getDistinctCategories } from "@/services/prediction-service";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://omdot.fun";

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#f97316",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "ŌM",
  appleWebApp: { capable: true, title: "ŌM", statusBarStyle: "black-translucent" },
  title: {
    default: "OMdotfun | Prediction markets & token launchpad",
    template: "%s - OMdotfun",
  },
  description: "Bet on real-world events and launch tokens in minutes. Prediction markets and a token launchpad on Solana and Arc.",
  keywords: ["prediction market", "solana", "crypto prediction", "pari mutuel", "USDC", "web3"],
  authors: [{ name: "OMdotfun" }],
  creator: "OMdotfun",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "OMdotfun",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "OMdotfun — prediction markets & token launchpad" }],
    title: "OMdotfun | Prediction markets & token launchpad",
    description: "Bet on real-world events and launch tokens in minutes. Prediction markets and a token launchpad on Solana and Arc.",
  },
  twitter: {
    card: "summary_large_image",
    images: ["/opengraph-image"],
    title: "OMdotfun | Prediction markets & token launchpad",
    description: "Bet on real-world events and launch tokens in minutes. Prediction markets and a token launchpad on Solana and Arc.",
  },
  icons: { icon: "/og-logo.png", apple: "/og-logo.png" },
  manifest: "/manifest.json",
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
          <div className="flex min-h-screen">
          <DesktopSidebar />
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <HeaderSwitch />
            <CategoryNavWrapper categories={categories} />
            <main className="flex-1 pb-28 md:pb-0">{children}</main>
            <div className="hidden md:block"><Footer /></div>
            <RootBottomNav />
          </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
