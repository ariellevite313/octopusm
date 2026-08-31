import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { getLaunchpadTokens } from "@/services/launchpad-service";
import type { LaunchpadToken } from "@/services/launchpad-service";

export const metadata: Metadata = {
  title: "Coming Soon — Launchpad",
  description: "Upcoming token launches on OMdotfun.",
};

export const revalidate = 60;

function Countdown({ scheduledAt }: { scheduledAt: string }) {
  const target = new Date(scheduledAt);
  const now = new Date();
  const diff = target.getTime() - now.getTime();

  if (diff <= 0) return <span className="text-emerald-500 font-semibold">Launching now</span>;

  const days  = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins  = Math.floor((diff % 3_600_000) / 60_000);

  return (
    <span className="font-mono text-xs font-semibold text-violet-600 dark:text-violet-400">
      {days > 0 ? `${days}d ` : ""}{String(hours).padStart(2, "0")}h {String(mins).padStart(2, "0")}m
    </span>
  );
}

function ComingSoonCard({ token }: { token: LaunchpadToken }) {
  return (
    <Link
      href={`/launchpad/${token.id}`}
      className="flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3.5 transition-all hover:border-violet-400/40 hover:shadow-sm"
    >
      {/* Logo */}
      {token.logo_url ? (
        <Image
          src={token.logo_url}
          alt={token.name}
          width={44}
          height={44}
          className="rounded-xl object-cover shrink-0"
          unoptimized
        />
      ) : (
        <div className="flex size-11 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30 text-base font-bold text-violet-600 dark:text-violet-400 shrink-0">
          {token.ticker.slice(0, 2)}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{token.name}</p>
          <span className="text-xs text-muted-foreground shrink-0">${token.ticker}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground mt-0.5">{token.description}</p>
      </div>

      {/* Category */}
      <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
        {token.category}
      </span>

      {/* Countdown */}
      <div className="text-right shrink-0">
        <p className="text-[10px] text-muted-foreground mb-0.5">Launches in</p>
        {token.scheduled_at && <Countdown scheduledAt={token.scheduled_at} />}
      </div>
    </Link>
  );
}

async function ComingSoonContent() {
  const { tokens } = await getLaunchpadTokens({ status: "coming_soon", limit: 50 });

  if (tokens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-3xl mb-3">🕐</p>
        <p className="text-sm font-medium text-foreground mb-1">No scheduled launches yet</p>
        <p className="text-xs text-muted-foreground mb-5">
          Schedule your token launch up to 1 month in advance
        </p>
        <Link
          href="/launchpad/create"
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Schedule a launch
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tokens.map((token) => (
        <ComingSoonCard key={token.id} token={token} />
      ))}
    </div>
  );
}

export default function ComingSoonPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/launchpad" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              ← Launchpad
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Coming Soon</h1>
          <p className="text-sm text-muted-foreground">Scheduled token launches</p>
        </div>
        <Link
          href="/launchpad/create"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          + Schedule launch
        </Link>
      </div>

      <Suspense fallback={
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      }>
        <ComingSoonContent />
      </Suspense>
    </main>
  );
}
