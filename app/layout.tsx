import type { Metadata } from "next";
import { Providers } from "@/providers/providers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://octomarket.fun";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Octo Market",
    template: "%s — Octo Market",
  },
  description: "Decentralized prediction markets on Solana. Bet on sports, crypto, and world events with USDC or ClawdTrust.",
  keywords: ["prediction market", "solana", "crypto betting", "pari mutuel", "USDC", "web3"],
  authors: [{ name: "Octo Market" }],
  creator: "Octo Market",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Octo Market",
    title: "Octo Market",
    description: "Decentralized prediction markets on Solana. Bet on sports, crypto, and world events with USDC or ClawdTrust.",
    images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: "Octo Market" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Octo Market",
    description: "Decentralized prediction markets on Solana.",
    images: ["/branding-logo.jpeg"],
  },
  icons: { icon: "/og-logo.png", apple: "/og-logo.png" },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
