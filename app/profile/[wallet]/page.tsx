import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { Megaphone } from "lucide-react";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/services/profile-service";
import { ProfilePnlChart } from "@/components/profile/profile-pnl-chart";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import { fmt, shortAddress } from "@/lib/format";
import { Tr } from "@/lib/i18n";
import { MemberSince } from "@/components/profile/member-since";
import { FollowButton, FollowCounts, BannerCamera, ProfileMenu } from "@/components/profile/profile-social";
import { createAdminClient } from "@/lib/supabase/server";
import { getFeaturedTokens } from "@/lib/social/featured-token";
import { FeaturedTokenControl } from "@/components/profile/featured-token";
import { AvatarZoom } from "@/components/profile/avatar-zoom";
import { AidoBadge } from "@/components/profile/aido-link";
import { ProfileBio, ProfileCommunity, type PinnedCommunity } from "@/components/profile/profile-community";
import { memberFaces } from "@/lib/social/communities";
import Link from "next/link";
import { JanusBadgeIcon } from "@/components/janus/janus-icon";
import { FrameWrap } from "@/components/profile/profile-flair";
import { LevelsButton } from "@/components/profile/levels-sheet";
import { frameOf, levelIndex, type FrameId } from "@/lib/profile-cosmetics";
import { OCTO_TIERS } from "@/components/leaderboard/octo-tier-badge";

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

  // Bannière lue hors cache (le profil public est mis en cache 60 s)
  let bannerSrc: string | null = null;
  let frame: FrameId | null = null;
  let aiOwner: { wallet: string; name: string } | null = null;
  let aido: string | null = null;
  let aidoHandle: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: b } = await admin.from("wallets").select("banner_src, ai_owner").eq("address", wallet).maybeSingle();
    bannerSrc = b?.banner_src ?? null;
    // Animations de profil (colonnes ajoutées par 20261221_profile_cosmetics)
    const { data: fx } = await admin.from("wallets").select("profile_frame").eq("address", wallet).maybeSingle();
    if (fx) {
      const f = frameOf(fx.profile_frame);
      // Un contour de niveau n'est plus porté si le niveau est redescendu
      const lvlOk = !f || !("level" in f.unlock) || levelIndex(data.stats.octo_balance) >= OCTO_TIERS.findIndex((t) => t.label === (f.unlock as { level: string }).level);
      frame = f && lvlOk ? f.id : null;
    }
    if (b?.ai_owner) {
      const { data: o } = await admin.from("wallets").select("display_name, username").eq("address", b.ai_owner).maybeSingle();
      aiOwner = { wallet: b.ai_owner, name: o?.display_name || o?.username || shortAddress(b.ai_owner) };
    }
    const { data: l } = await admin.from("aido_links").select("aido_address, aido_handle").eq("wallet", wallet).maybeSingle();
    aido = l?.aido_address ?? null;
    aidoHandle = l?.aido_handle ?? null;
  } catch { /* colonnes absentes avant migration */ }
  const featured = (await getFeaturedTokens(createAdminClient(), [wallet])).get(wallet) ?? null;
  // Bio et communauté épinglée (colonnes ajoutées par la migration des communautés)
  let bio: string | null = null;
  let ambassador = false;
  let ambInfo: { since: string | null; referred: number; community: { slug: string; name: string; members: number } | null } | null = null;
  let pinned: PinnedCommunity | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: w } = await admin.from("wallets").select("bio, pinned_community_id").eq("address", wallet).maybeSingle();
    bio = w?.bio ?? null;
    const { data: amb } = await admin.from("ambassadors").select("active, approved_at, community_id").eq("wallet", wallet).maybeSingle();
    ambassador = !!amb?.active;
    if (ambassador) {
      const [{ count }, comm] = await Promise.all([
        admin.from("referrals").select("referred_wallet", { count: "exact", head: true }).eq("referrer_wallet", wallet),
        amb.community_id ? admin.from("communities").select("slug, name, member_count").eq("id", amb.community_id).eq("hidden", false).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      ambInfo = { since: amb.approved_at ?? null, referred: Number(count) || 0, community: comm.data ? { slug: comm.data.slug, name: comm.data.name, members: Number(comm.data.member_count) || 0 } : null };
    }
    if (w?.pinned_community_id) {
      const { data: c } = await admin.from("communities").select("id, slug, name, logo_src, category, member_count").eq("id", w.pinned_community_id).eq("hidden", false).maybeSingle();
      if (c) pinned = { slug: c.slug, name: c.name, logo_src: c.logo_src, category: c.category, member_count: c.member_count, faces: await memberFaces(admin, c.id, 4) };
    }
  } catch { /* avant migration */ }


  return (
    <>
      {/* ── 1. Identity card ─────────────────────────────────────────── */}
      <div className="-mx-4 overflow-hidden border-b border-border bg-card sm:mx-0 sm:rounded-[24px] sm:border">
        {/* Banner */}
        <div
          className="profile-banner relative h-36 bg-cover bg-center sm:h-48"
          style={bannerSrc ? { backgroundImage: `url(${bannerSrc})` } : undefined}
        >
          <ProfileMenu wallet={wallet} hasFeatured={!!featured} name={displayName} />
          <BannerCamera wallet={wallet} />
        </div>

        <div className="px-5 pb-5">
          {/* Avatar — large, overlapping the banner */}
          <div className="relative z-10 -mt-[60px] mb-3 flex items-end justify-between">
            <FrameWrap frame={frame}>
            {avatarSrc ? (
              <AvatarZoom src={avatarSrc} alt={displayName}>
                <Image
                  src={avatarSrc}
                  alt={displayName}
                  width={120}
                  height={120}
                  className={`size-[120px] shrink-0 rounded-full object-cover ring-[6px] ring-card ${data.stats.rank && data.stats.rank <= 3 ? "avatar-glow" : ""}`}
                />
              </AvatarZoom>
            ) : (
              <div className={`flex size-[120px] shrink-0 items-center justify-center rounded-full bg-primary text-5xl font-bold text-white ring-[6px] ring-card ${data.stats.rank && data.stats.rank <= 3 ? "avatar-glow" : ""}`}>
                {displayName[0].toUpperCase()}
              </div>
            )}
            </FrameWrap>
            <div className="flex items-center gap-2 pb-1">
              {data.wallet?.twitter_handle && (
                <a
                  href={`https://twitter.com/${data.wallet.twitter_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`@${data.wallet.twitter_handle}`}
                  title={`@${data.wallet.twitter_handle}`}
                  className="flex size-10 items-center justify-center text-foreground transition-opacity hover:opacity-70"
                >
                  <XLogo size={18} />
                </a>
              )}
              <FollowButton wallet={wallet} />
            </div>
          </div>

          {/* Name + badge */}
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-[30px] font-extrabold leading-tight tracking-tight text-foreground">
              {displayName}
            </h1>
            <OctoBadge totalOcto={data.stats.octo_balance} size={24} />
            <FeaturedTokenControl wallet={wallet} token={featured} />
          </div>

          {/* Handle + X */}
          <p className="mt-1.5 font-mono text-[15px] text-muted-foreground">{shortAddress(wallet)}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <LevelsButton wallet={wallet} avatar={avatarSrc} />
            {aiOwner && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground py-1 pl-1 pr-3 text-[12px] font-bold text-background">
                <JanusBadgeIcon size={18} />Janus <span className="font-medium opacity-80"><Tr>AI of</Tr></span> <Link href={`/profile/${aiOwner.wallet}`} className="underline">{aiOwner.name}</Link>
              </span>
            )}
            {ambassador && <Link href="/ambassadors" className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-[12px] font-bold text-background"><Megaphone className="size-3.5" /><Tr>Ambassador</Tr></Link>}
            {!aiOwner && <AidoBadge wallet={wallet} aido={aido} handle={aidoHandle} />}
          </div>

          {ambassador && ambInfo && (
            <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border">
              <div className="bg-card px-3 py-2.5"><p className="num text-[18px] font-extrabold text-foreground">{ambInfo.referred.toLocaleString()}</p><p className="text-[11px] text-muted-foreground"><Tr>People referred</Tr></p></div>
              <div className="bg-card px-3 py-2.5"><p className="num text-[18px] font-extrabold text-foreground">{ambInfo.since ? new Date(ambInfo.since).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "-"}</p><p className="text-[11px] text-muted-foreground"><Tr>Ambassador since</Tr></p></div>
              {ambInfo.community
                ? <Link href={`/c/${ambInfo.community.slug}`} className="min-w-0 bg-card px-3 py-2.5 transition-colors hover:bg-muted/50"><p className="truncate text-[15px] font-extrabold text-foreground">{ambInfo.community.name}</p><p className="num text-[11px] text-muted-foreground">{ambInfo.community.members.toLocaleString()} <Tr>members</Tr></p></Link>
                : <div className="bg-card px-3 py-2.5"><p className="text-[15px] font-extrabold text-foreground">-</p><p className="text-[11px] text-muted-foreground"><Tr>Community</Tr></p></div>}
            </div>
          )}

          <ProfileBio wallet={wallet} bio={bio} />

          {/* Stats — inline, like followers / following */}
          <div className="num mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[15px]">
            <span><span className="font-bold text-foreground">{data.stats.total_rounds}</span> <span className="text-muted-foreground"><Tr>Rounds</Tr></span></span>
            <span><span className="font-bold text-up">{data.stats.win_rate}%</span> <span className="text-muted-foreground"><Tr>Win rate</Tr></span></span>
            <span><span className="font-bold text-foreground">{fmt(data.stats.octo_balance, 0)}</span> <span className="text-muted-foreground">OMERO</span></span>
            {data.stats.rank && (
              <span><span className="font-bold text-foreground">#{data.stats.rank}</span> <span className="text-muted-foreground"><Tr>Rank</Tr></span></span>
            )}
            <FollowCounts wallet={wallet} />
          </div>

          {joinedAt && (
            <p className="mt-2 text-[13px] text-muted-foreground">
              <MemberSince iso={joinedAt} />
            </p>
          )}
          <ProfileCommunity c={pinned} />
        </div>
      </div>

      {/* ── Total earned (before recent activity) ─────────────── */}
      <ProfilePnlChart
        series={data.pnl_series}
        totalUsd={data.earnings.won_usd + data.earnings.launchpad_usd + data.earnings.market_fees_usd}
        predictionUsd={data.earnings.won_usd}
        launchpadUsd={data.earnings.launchpad_usd}
        marketFeesUsd={data.earnings.market_fees_usd}
        openCount={data.earnings.open_count}
        openStakeUsd={data.earnings.open_stake_usd}
        share={{ wallet, name: displayName }}
      />

      {/* ── Recent activity / Tokens launched / Markets created (tabs) ── */}
      <ProfileTabs
        activity={data.activity}
        volume={data.volume}
        tokens={data.created_tokens}
        markets={data.created_markets}
        wallet={wallet}
      />

      {/* Empty state */}
      {false && data.stats.total_rounds === 0 && data.created_markets.length === 0 && data.created_tokens.length === 0 && (
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
