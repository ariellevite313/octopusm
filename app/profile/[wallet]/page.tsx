import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/services/profile-service";
import { ProfilePnlChart } from "@/components/profile/profile-pnl-chart";
import { ProfileActivityList } from "@/components/profile/profile-activity-list";
import { ProfileTokensList } from "@/components/profile/profile-tokens-list";
import { ProfileMarketsList } from "@/components/profile/profile-markets-list";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import { fmt, shortAddress } from "@/lib/format";
import { Tr } from "@/lib/i18n";
import { MemberSince } from "@/components/profile/member-since";

// ─── Page config ──────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ wallet: string }>;
}): Promise<Metadata> {
  const { wallet } = await params;
  const short = `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
  return {
    title: `Profile — ${short}`,
    description: `Public profile of ${short} on OMdotfun`,
  };
}

// X (Twitter) logo SVG
function XLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-label="X (Twitter)">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Identity card skeleton */}
      <div className="rounded-[22px] border border-border bg-card p-5">
        <div className="flex items-start gap-4">
          <div className="size-14 shrink-0 rounded-full bg-muted/50" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded bg-muted/50" />
            <div className="h-3 w-20 rounded bg-muted/40" />
            <div className="h-3 w-24 rounded bg-muted/30" />
          </div>
          <div className="h-8 w-12 rounded bg-muted/40" />
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="px-2 text-center space-y-1">
              <div className="mx-auto h-2.5 w-12 rounded bg-muted/40" />
              <div className="mx-auto h-5 w-10 rounded bg-muted/50" />
            </div>
          ))}
        </div>
      </div>
      {/* Chart skeleton */}
      <div className="rounded-[22px] border border-border bg-card p-4">
        <div className="flex gap-2 mb-4">
          <div className="h-7 w-20 rounded-full bg-muted/50" />
          <div className="h-7 w-24 rounded-full bg-muted/40" />
        </div>
        <div className="h-3 w-24 rounded bg-muted/40 mb-2" />
        <div className="h-6 w-28 rounded bg-muted/50 mb-4" />
        <div className="h-32 rounded bg-muted/20" />
      </div>
      {/* Activity skeleton */}
      <div className="rounded-[22px] border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-2.5">
          <div className="h-2.5 w-28 rounded bg-muted/40" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
            <div className="h-5 w-14 rounded-full bg-muted/40" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-40 rounded bg-muted/50" />
              <div className="h-2.5 w-24 rounded bg-muted/30" />
            </div>
            <div className="h-4 w-16 rounded bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Profile content (async, data-fetching) ───────────────────────────────────

async function ProfileContent({ wallet }: { wallet: string }) {
  const data = await getPublicProfile(wallet);

  const displayName = data.wallet?.display_name ?? shortAddress(wallet);
  const avatarSrc   = data.wallet?.avatar_src ?? null;
  const joinedAt    = data.wallet?.created_at ?? null;


  return (
    <>
      {/* ── 1. Identity card ─────────────────────────────────────────── */}
      <div className="-mx-4 overflow-hidden border-b border-border bg-card sm:mx-0 sm:rounded-[24px] sm:border">
        {/* Banner */}
        <div className="profile-banner relative h-32 sm:h-44">
          {data.stats.rank && (
            <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-black/45 px-3.5 py-2 text-white backdrop-blur-md">
              <span className="text-[13px] font-medium text-white/75"><Tr>Rank</Tr></span>
              <span className="num text-[15px] font-bold">#{data.stats.rank}</span>
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          {/* Avatar — overlaps the banner */}
          <div className="relative z-10 -mt-12 mb-3 w-fit">
            {avatarSrc ? (
              <Image
                src={avatarSrc}
                alt={displayName}
                width={96}
                height={96}
                className={`size-24 shrink-0 rounded-full object-cover ring-4 ring-card ${data.stats.rank && data.stats.rank <= 3 ? "avatar-glow" : ""}`}
              />
            ) : (
              <div className={`flex size-24 shrink-0 items-center justify-center rounded-full bg-primary text-4xl font-bold text-white ring-4 ring-card ${data.stats.rank && data.stats.rank <= 3 ? "avatar-glow" : ""}`}>
                {displayName[0].toUpperCase()}
              </div>
            )}
          </div>

          {/* Name + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[28px] font-bold leading-tight tracking-tight text-foreground">
              {displayName}
            </h1>
            <OctoBadge totalOcto={data.stats.octo_balance} size={18} />
            {data.wallet?.twitter_handle && (
              <a
                href={`https://twitter.com/${data.wallet.twitter_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`@${data.wallet.twitter_handle}`}
                className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-foreground hover:text-background"
              >
                <XLogo size={14} />
              </a>
            )}
          </div>

          {data.wallet?.display_name && (
            <p className="mt-0.5 font-mono text-[15px] text-muted-foreground">
              {shortAddress(wallet)}
            </p>
          )}

          {/* Stats — inline, like followers / following */}
          <div className="num mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[15px]">
            <span><span className="font-bold text-foreground">{data.stats.total_rounds}</span> <span className="text-muted-foreground"><Tr>Rounds</Tr></span></span>
            <span><span className="font-bold text-up">{data.stats.win_rate}%</span> <span className="text-muted-foreground"><Tr>Win rate</Tr></span></span>
            <span><span className="font-bold text-foreground">{fmt(data.stats.octo_balance, 0)}</span> <span className="text-muted-foreground">OMERO</span></span>
          </div>

          {joinedAt && (
            <p className="mt-2 text-[13px] text-muted-foreground">
              <MemberSince iso={joinedAt} />
            </p>
          )}
        </div>
      </div>

      {/* ── Total earned (before recent activity) ─────────────── */}
      <ProfilePnlChart
        series={data.pnl_series}
        totalUsd={data.earnings.won_usd}
        launchpadUsd={data.earnings.launchpad_usd}
        marketFeesUsd={data.earnings.market_fees_usd}
        openCount={data.earnings.open_count}
        openStakeUsd={data.earnings.open_stake_usd}
      />

      {/* ── 3. Recent activity ─────────────────────────────────────── */}
      <ProfileActivityList items={data.activity} volume={data.volume} />

      {/* ── 4. Tokens launched (Solana + Arc) ─────────────────────── */}
      <ProfileTokensList tokens={data.created_tokens} />

      {/* ── 5. Markets created ──────────────────────────────────────── */}
      <ProfileMarketsList markets={data.created_markets} />

      {/* Empty state */}
      {data.stats.total_rounds === 0 && data.created_markets.length === 0 && data.created_tokens.length === 0 && (
        <div className="rounded-[22px] border border-border bg-card px-6 py-16 text-center">
          <p className="text-muted-foreground"><Tr>No activity yet for this address.</Tr></p>
        </div>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const { wallet: rawWallet } = await params;

  // Adresse Solana (base58) ou Arc / EVM (0x + 40 hex, stockée en minuscules)
  const isSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(rawWallet);
  const isEvm    = /^0x[0-9a-fA-F]{40}$/.test(rawWallet);
  if (!isSolana && !isEvm) {
    notFound();
  }
  const wallet = isEvm ? rawWallet.toLowerCase() : rawWallet;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl space-y-6 px-4 pb-6 sm:pt-6">
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileContent wallet={wallet} />
        </Suspense>
      </div>
    </div>
  );
}
