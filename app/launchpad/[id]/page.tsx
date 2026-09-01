import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { getLaunchpadToken, getLaunchpadTokenByMint } from "@/services/launchpad-service";
import { LaunchButton } from "@/components/launchpad/launch-button";
import { WatchlistButton } from "@/components/launchpad/watchlist-button";
import { TokenChart } from "@/components/launchpad/token-chart";
import { TokenMarketStats } from "@/components/launchpad/token-market-stats";
import { CopyMint } from "@/components/launchpad/copy-mint";
import { ClaimFeesButton } from "@/components/dashboard/claim-fees-button";
import { LaunchpadComments } from "@/components/launchpad/launchpad-comments";
import { TokenTradeStats } from "@/components/launchpad/token-trade-stats";
import { TokenShareButton } from "@/components/launchpad/token-share-button";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { createAdminClient } from "@/lib/supabase/server";
import type { MarketCommentEnriched } from "@/lib/supabase/types";

export const revalidate = 30;

type Props = { params: Promise<{ id: string }> };

// ── Deduplicated token fetch (avoids double DB call between generateMetadata + page) ──

const getCachedToken = cache(async (id: string) =>
  id.length > 36 ? getLaunchpadTokenByMint(id) : getLaunchpadToken(id),
);

// ── Comments loader ───────────────────────────────────────────────────────────

async function getInitialComments(tokenId: string, wallet: string | null): Promise<MarketCommentEnriched[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: rows } = await admin
    .from("launchpad_comments")
    .select("id, token_id, wallet_address, username, avatar_src, content, created_at, parent_id")
    .eq("token_id", tokenId)
    .order("created_at", { ascending: true });

  const comments = (rows ?? []) as Array<Record<string, unknown>>;

  if (comments.length === 0) return [];

  const commentIds  = comments.map(c => c.id as string);
  const uniqueWallets = [...new Set(comments.map(c => c.wallet_address as string))];

  // Run all enrichment queries in parallel
  const [omeroResult, likeCountsResult, userLikesResult] = await Promise.all([
    admin.from("leaderboard_octo").select("wallet_address, total_octo").in("wallet_address", uniqueWallets),
    admin.from("launchpad_comment_likes").select("comment_id").in("comment_id", commentIds),
    wallet
      ? admin.from("launchpad_comment_likes").select("comment_id").eq("wallet_address", wallet).in("comment_id", commentIds)
      : Promise.resolve({ data: [] as { comment_id: string }[] }),
  ]);

  // Build lookup maps
  const octoMap: Record<string, number> = {};
  for (const row of (omeroResult.data ?? []) as { wallet_address: string; total_octo: number }[]) {
    octoMap[row.wallet_address] = Number(row.total_octo ?? 0);
  }

  const likeCountMap: Record<string, number> = {};
  for (const row of (likeCountsResult.data ?? []) as { comment_id: string }[]) {
    likeCountMap[row.comment_id] = (likeCountMap[row.comment_id] ?? 0) + 1;
  }

  const likedSet = new Set<string>(
    ((userLikesResult.data ?? []) as { comment_id: string }[]).map(l => l.comment_id),
  );

  // Build threaded structure
  const byId: Record<string, MarketCommentEnriched> = {};
  const topLevel: MarketCommentEnriched[] = [];

  for (const c of comments) {
    const enriched: MarketCommentEnriched = {
      id:             c.id as string,
      market_id:      c.token_id as string,
      wallet_address: c.wallet_address as string,
      username:       c.username as string | null,
      avatar_src:     c.avatar_src as string | null,
      content:        c.content as string,
      created_at:     c.created_at as string,
      parent_id:      c.parent_id as string | null,
      like_count:     likeCountMap[c.id as string] ?? 0,
      liked_by_me:    likedSet.has(c.id as string),
      octo_balance:   octoMap[c.wallet_address as string] ?? 0,
      replies:        [],
    };
    byId[enriched.id] = enriched;
  }

  for (const enriched of Object.values(byId)) {
    if (enriched.parent_id && byId[enriched.parent_id]) {
      byId[enriched.parent_id].replies.push(enriched);
    } else if (!enriched.parent_id) {
      topLevel.push(enriched);
    }
  }

  return topLevel;
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const token = await getCachedToken(id);
  if (!token) return { title: "Token not found" };

  const siteUrl     = process.env.NEXT_PUBLIC_SITE_URL ?? "https://omdot.fun";
  const canonical   = token.mint_address
    ? `${siteUrl}/launchpad/${token.mint_address}`
    : `${siteUrl}/launchpad/${id}`;
  const title       = `${token.name} ($${token.ticker}) — OMdotfun`;
  const description = token.description ?? `${token.name} on OMdotfun Launchpad`;
  const ogImage     = (token.logo_url as string | null) ?? `${siteUrl}/branding-logo.jpeg`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      siteName: "OMdotfun",
      type:     "website",
      url:      canonical,
      images:   [{ url: ogImage, width: 400, height: 400, alt: token.name as string }],
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description,
      images:      [ogImage],
    },
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, isTradeable }: { status: string; isTradeable: boolean }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:    { label: "Pending",    cls: "bg-yellow-500/15 text-yellow-500 border border-yellow-500/30" },
    active:     { label: isTradeable ? "Live" : "Scheduled", cls: isTradeable ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-violet-500/15 text-violet-400 border border-violet-500/30" },
    graduating: { label: "Graduating", cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
    graduated:  { label: "Graduated",  cls: "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30" },
    cancelled:  { label: "Cancelled",  cls: "bg-red-500/15 text-red-400 border border-red-500/30" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground text-right max-w-[60%] break-all">{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
      {children}
    </p>
  );
}

function formatSupply(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(0)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)}M`;
  return n.toLocaleString();
}

function shortAddr(s: string, head = 4, tail = 4) {
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TokenDetailPage({ params }: Props) {
  const { id } = await params;
  const [token, walletAddress] = await Promise.all([
    getCachedToken(id),   // reuses the same DB call as generateMetadata
    getWalletAddress(),
  ]);
  if (!token) notFound();

  const isCreator = walletAddress === token.creator_wallet;


  const initialComments = await getInitialComments(token.id, walletAddress);

  const socials = [
    { label: "Website",    href: token.website,       icon: "ti-world" },
    { label: "Twitter",    href: token.twitter,        icon: "ti-brand-x" },
    { label: "Telegram",   href: token.telegram,       icon: "ti-brand-telegram" },
    { label: "Discord",    href: token.discord,        icon: "ti-brand-discord" },
    { label: "Other",      href: token.other_social,   icon: "ti-link" },
    { label: "Whitepaper", href: token.whitepaper_url, icon: "ti-file-text" },
  ].filter(s => s.href);

  const isPending   = token.status === "pending";
  const isActive    = token.status === "active" || token.status === "graduating";
  const isGraduated = token.status === "graduated";
  const showChart   = (isActive || isGraduated) && !!token.mint_address;

  // Birdeye uses mint address for token pages
  const birdeyeTokenUrl = token.mint_address
    ? `https://birdeye.so/token/${token.mint_address}?chain=solana`
    : null;

  const creatorInitials     = token.creator_wallet.slice(0, 2).toUpperCase();
  const creatorDisplayName  = token.creator_display_name ?? null;

  return (
    <main className="mx-auto max-w-5xl">

      {/* ── Hero banner ─────────────────────────────────────────────────────── */}
      <div className="relative h-36 md:h-48">

        {/* Background clipped */}
        <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
          {token.logo_url && (
            <Image
              src={token.logo_url}
              alt=""
              fill
              className="object-cover opacity-20 blur-md scale-110"
              unoptimized
              role="presentation"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        </div>

        {/* Back link */}
        <div className="absolute top-4 left-4">
          <Link
            href="/launchpad"
            className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white transition-colors"
          >
            ← Launchpad
          </Link>
        </div>

        {/* Floating avatar */}
        <div className="absolute bottom-0 translate-y-1/2 left-4 md:left-6">
          {token.logo_url ? (
            <Image
              src={token.logo_url}
              alt={token.name}
              width={72}
              height={72}
              className="size-14 md:size-[72px] rounded-2xl border-2 border-background object-cover shadow-lg"
              unoptimized
            />
          ) : (
            <div className="size-14 md:size-[72px] rounded-2xl border-2 border-background bg-violet-900/60 flex items-center justify-center text-xl font-semibold text-violet-300 shadow-lg">
              {token.ticker.slice(0, 2)}
            </div>
          )}
        </div>
      </div>

      {/* ── Token header ────────────────────────────────────────────────────── */}
      <div className="pt-10 md:pt-12 px-4 md:px-6 flex items-start justify-between gap-4 flex-wrap">

        {/* Left: name, ticker, badges, CA */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold text-foreground">{token.name}</h1>
            <StatusBadge status={token.status} isTradeable={token.is_tradeable} />
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {token.category}
            </span>
            {token.is_verified && (
              <span className="rounded-full bg-orange-500/15 border border-orange-500/30 px-2 py-0.5 text-[10px] font-semibold text-orange-400">
                ✓ Verified
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground mb-2">${token.ticker}</div>
          {token.mint_address && (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-muted-foreground">
                {shortAddr(token.mint_address, 6, 6)}
              </span>
              <CopyMint address={token.mint_address} />
              <a
                href={`https://solscan.io/token/${token.mint_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="View on Solscan"
              >
                <ExternalLink className="size-3" />
              </a>
            </div>
          )}
        </div>

        {/* Right: socials + share */}
        <div className="flex items-center gap-4 flex-wrap">
          {socials.map(s => (
            <a
              key={s.label}
              href={s.href!}
              target="_blank"
              rel="noopener noreferrer"
              title={s.label}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <i className={`ti ${s.icon} text-base`} aria-hidden />
            </a>
          ))}
          <TokenShareButton name={token.name} ticker={token.ticker} />
        </div>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      {showChart && (
        <div className="mt-4">
          <TokenMarketStats mintAddress={token.mint_address!} variant="bar" />
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="mt-6 px-4 md:px-6 pb-10 grid gap-8 md:grid-cols-[1fr_280px] items-start">

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="space-y-8">

          {showChart && (
            <TokenChart mintAddress={token.mint_address!} name={token.name} />
          )}

          {showChart && token.mint_address && (
            <TokenTradeStats mintAddress={token.mint_address} />
          )}

          {isPending && (
            <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
              <p className="text-sm font-medium text-foreground mb-1">Awaiting launch</p>
              <p className="text-xs text-muted-foreground">The chart will appear once the token is deployed on-chain.</p>
            </div>
          )}

          {isGraduated && (
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-4 text-center">
              <p className="text-sm font-semibold text-indigo-400">🎓 Graduated to DAMM</p>
              <p className="text-xs text-muted-foreground mt-1">This token is now fully tradeable.</p>
              {birdeyeTokenUrl && (
                <a
                  href={birdeyeTokenUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-indigo-400 underline"
                >
                  Trade on Birdeye →
                </a>
              )}
            </div>
          )}

          {token.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {token.description}
            </p>
          )}

          <div>
            <SectionLabel>Comments</SectionLabel>
            <LaunchpadComments
              tokenId={token.id}
              initialComments={initialComments}
              isAuthenticated={!!walletAddress}
              walletAddress={walletAddress}
            />
          </div>
        </div>

        {/* ── Right sidebar ───────────────────────────────────────────────── */}
        <div className="space-y-6">

          <div className="space-y-2">
            {/* Trade CTA — active + tradeable only */}
            {isActive && token.is_tradeable && birdeyeTokenUrl && (
              <a
                href={birdeyeTokenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors"
              >
                Trade on Birdeye →
              </a>
            )}

            <WatchlistButton tokenId={token.id} />

            {/* Launch button — creator only */}
            {isPending && isCreator && (
              <div className="space-y-3 pt-1">
                <LaunchButton
                  tokenId={token.id}
                  walletAddress={token.creator_wallet}
                  isScheduled={token.is_scheduled}
                />
              </div>
            )}

            {/* Claim fees — creator only */}
            {isCreator && (isActive || isGraduated) && (
              <div className="pt-2 space-y-1.5">
                <SectionLabel>Creator fees</SectionLabel>
                <p className="text-xs text-muted-foreground mb-2">Claim your accumulated trading fees.</p>
                <ClaimFeesButton
                  tokenId={token.id}
                  walletAddress={token.creator_wallet}
                  poolAddress={token.pool_address ?? ""}
                />
              </div>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Token info */}
          <div>
            <SectionLabel>Token info</SectionLabel>
            <InfoRow label="Network" value="Solana" />
            <InfoRow label="Supply"  value={formatSupply(token.supply)} />
            {token.first_buy_amount && (
              <InfoRow label="First buy" value={`${token.first_buy_amount} SOL`} />
            )}
            {token.is_scheduled && token.scheduled_at && (
              <InfoRow label="Launch date" value={new Date(token.scheduled_at).toLocaleString("en-US")} />
            )}
            {token.share_top100 && token.share_top100_pct && (
              <InfoRow label="Top 100 share" value={`${token.share_top100_pct}% of creator fees`} />
            )}
          </div>

          <div className="border-t border-border" />

          {/* Creator */}
          <div>
            <SectionLabel>Creator</SectionLabel>
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground border border-border shrink-0">
                {creatorInitials}
              </div>
              <div className="min-w-0">
                <a
                  href={`/profile/${token.creator_wallet}`}
                  className="block hover:text-primary transition-colors"
                >
                  {creatorDisplayName ? (
                    <>
                      <span className="block text-xs font-medium text-foreground">{creatorDisplayName}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{shortAddr(token.creator_wallet, 6, 6)}</span>
                    </>
                  ) : (
                    <span className="font-mono text-[11px] text-foreground break-all">{shortAddr(token.creator_wallet, 6, 6)}</span>
                  )}
                </a>
              </div>
            </div>
          </div>

          {/* Pool address */}
          {token.pool_address && (
            <>
              <div className="border-t border-border" />
              <div>
                <SectionLabel>Pool</SectionLabel>
                <a
                  href={`https://birdeye.so/token/${token.pool_address}?chain=solana`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-blue-400 break-all hover:underline"
                >
                  {shortAddr(token.pool_address, 8, 8)}
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
