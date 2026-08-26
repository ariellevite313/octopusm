import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getLaunchpadTokens } from "@/services/launchpad-service";
import { LaunchpadClient } from "@/components/launchpad/launchpad-client";

export const metadata: Metadata = {
  title: "Launchpad",
  description: "Launch your Solana token on OMdotfun.",
  alternates: { canonical: "https://omdot.fun/launchpad" },
  openGraph: {
    title: "OMdotfun Launchpad",
    description: "Launch your Solana token on OMdotfun.",
    url: "https://omdot.fun/launchpad",
    type: "website",
    images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: "OMdotfun Launchpad" }],
  },
};

export const revalidate = 30;

async function LaunchpadContent() {
  const tokens = await getLaunchpadTokens({ limit: 50, excludeStatuses: ["pending", "cancelled"] });
  return <LaunchpadClient initialTokens={tokens} />;
}

function LaunchpadSkeleton() {
  return (
    <div className="space-y-4">
      {/* Fake top bar */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <div className="flex gap-1">
          {[80, 56, 88, 76].map(w => (
            <div key={w} className="h-7 animate-pulse rounded-md bg-muted/40" style={{ width: w }} />
          ))}
        </div>
      </div>
      {/* Grid */}
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

export default function LaunchpadPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Launchpad</h1>
          <p className="text-xs text-muted-foreground">Tokens launched on Solana</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/leaderboard"
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-amber-400 hover:text-amber-500"
          >
            🏆 Leaderboard
          </Link>
          <Link
            href="/launchpad/create"
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-400"
          >
            + Launch
          </Link>
        </div>
      </div>

      {/* Token grid */}
      <Suspense fallback={<LaunchpadSkeleton />}>
        <LaunchpadContent />
      </Suspense>

    </main>
  );
}
