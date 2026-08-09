import type { Metadata } from "next";
import { Suspense } from "react";
import { getLaunchpadTokens } from "@/services/launchpad-service";
import { LaunchpadClient } from "@/components/launchpad/launchpad-client";

export const metadata: Metadata = {
  title: "Launchpad",
  description: "Launch your Solana token with Meteora Dynamic Bonding Curve on OMdotfun.",
  alternates: { canonical: "https://omdot.fun/launchpad" },
  openGraph: {
    title: "OMdotfun Launchpad",
    description: "Launch your Solana token with Meteora Dynamic Bonding Curve.",
    url: "https://omdot.fun/launchpad",
    type: "website",
    images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: "OMdotfun Launchpad" }],
  },
};

export const revalidate = 30;

async function LaunchpadContent() {
  const tokens = await getLaunchpadTokens({ limit: 50 });
  return <LaunchpadClient initialTokens={tokens} />;
}

function LaunchpadSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-3 space-y-2 animate-pulse">
          <div className="size-10 rounded-xl bg-muted/40" />
          <div className="h-3.5 w-24 rounded bg-muted/40" />
          <div className="h-2.5 w-16 rounded bg-muted/30" />
          <div className="h-2.5 w-20 rounded bg-muted/20" />
        </div>
      ))}
    </div>
  );
}

export default function LaunchpadPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Launchpad</h1>
        <p className="text-sm text-muted-foreground">
          Tokens launched on Solana via Meteora DBC
        </p>
      </div>

      {/* Token grid */}
      <Suspense fallback={<LaunchpadSkeleton />}>
        <LaunchpadContent />
      </Suspense>

    </main>
  );
}
