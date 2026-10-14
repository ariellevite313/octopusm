import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
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
            <div key={w} className="h-7 animate-pulse rounded-xl bg-muted/40" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-[22px] border border-border bg-card p-2 animate-pulse">
            <div className="aspect-square w-full rounded-[16px] bg-muted/60" />
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
      <div className="mb-2 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left : title, total volume, trending */}
        <div className="min-w-0">
          <div className="mb-5">
            <h1 className="text-xl font-bold text-foreground">Launchpad</h1>
            <p className="text-sm text-muted-foreground">Tokens launched on Solana</p>
          </div>
          <div className="mb-7">
            <PlatformStats />
          </div>
          <TrendingStrip />
        </div>

        {/* Right (desktop) : launch your token */}
        <aside className="relative hidden overflow-hidden rounded-[28px] border border-border bg-card p-6 lg:block">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_85%_0%,rgba(255,122,26,0.22),transparent_70%)]" />
          <div className="relative">
            <Image src="/omdot-icon.png" alt="" width={56} height={56} className="logo-bounce mb-4" />
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Launch your token</h2>
            <p className="mt-1 text-sm text-muted-foreground">Live in a few minutes, on Solana or Arc.</p>
            <ol className="mt-5 space-y-3">
              {[
                "Pick a name, ticker and image",
                "Launch it on Solana or Arc",
                "Earn creator fees on every trade",
              ].map((step, i) => (
                <li key={step} className="flex items-center gap-3 text-[15px] text-foreground">
                  <span className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <Link
              href="/launchpad/create"
              className="btn-primary mt-6 flex h-12 w-full items-center justify-center rounded-2xl text-base"
            >
              + Launch
            </Link>
          </div>
        </aside>
      </div>
      <Suspense fallback={<LaunchpadSkeleton />}>
        <LaunchpadContent />
      </Suspense>
    </main>
  );
}
