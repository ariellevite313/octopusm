import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getLaunchpadTokens } from "@/services/launchpad-service";
import { LaunchpadClient } from "@/components/launchpad/launchpad-client";
import { TrendingStrip } from "@/components/launchpad/trending-strip";
import { PlatformStats } from "@/components/launchpad/platform-stats";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Launchpad — OMdotfun",
  description: "Launch your token on OMdotfun.",
  alternates: { canonical: "https://omdot.fun" },
  openGraph: {
    title: "OMdotfun Launchpad",
    description: "Launch your token on OMdotfun.",
    url: "https://omdot.fun",
    type: "website",
    images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: "OMdotfun Launchpad" }],
  },
};

async function LaunchpadContent() {
  const { tokens, total } = await getLaunchpadTokens({
    limit: 20,
    offset: 0,
    sort: "new",
    excludeStatuses: ["pending", "cancelled"],
    withCount: true,
  });
  return <LaunchpadClient initialTokens={tokens} initialTotal={total} />;
}

function LaunchpadSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <div className="flex gap-1">
          {[80, 56, 88, 76].map(w => (
            <div key={w} className="h-7 animate-pulse rounded-md bg-muted/40" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border bg-card animate-pulse">
            <div className="aspect-square w-full bg-muted/30" />
            <div className="p-2.5 space-y-2">
              <div className="h-3.5 w-24 rounded bg-muted/40" />
              <div className="h-2.5 w-14 rounded bg-muted/30" />
              <div className="flex justify-between">
                <div className="h-2.5 w-16 rounded bg-muted/20" />
                <div className="h-2.5 w-8 rounded bg-muted/20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Launchpad</h1>
          <p className="text-xs text-muted-foreground">Tokens launched on Solana</p>
        </div>
        <Link
          href="/launchpad/create"
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          + Launch
        </Link>
      </div>
      <PlatformStats />
      <TrendingStrip />
      <Suspense fallback={<LaunchpadSkeleton />}>
        <LaunchpadContent />
      </Suspense>
    </main>
  );
}
