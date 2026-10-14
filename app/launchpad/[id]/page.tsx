import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink, BadgeCheck, ChevronLeft, Sprout } from "lucide-react";
import { getLaunchpadToken, getLaunchpadTokenByMint } from "@/services/launchpad-service";
import { LaunchButton } from "@/components/launchpad/launch-button";
import { WatchlistButton } from "@/components/launchpad/watchlist-button";
import { TokenChart } from "@/components/launchpad/token-chart";
import { TokenMarketStats } from "@/components/launchpad/token-market-stats";
import { CopyMint } from "@/components/launchpad/copy-mint";
import { ClaimFeesButton } from "@/components/dashboard/claim-fees-button";
import { TokenSwap } from "@/components/launchpad/token-swap";
import { TokenSwapDBC } from "@/components/launchpad/token-swap-dbc";
import { TokenSwapJupiter } from "@/components/launchpad/token-swap-jupiter";
import { TokenSwapArc } from "@/components/launchpad/token-swap-arc";
import { LaunchpadComments } from "@/components/launchpad/launchpad-comments";
import { TokenTradeStats } from "@/components/launchpad/token-trade-stats";
import { TokenShareButton } from "@/components/launchpad/token-share-button";
import { BannerUploadButton } from "@/components/launchpad/banner-upload-button";
import { PoolRecoveryPrompt } from "@/components/launchpad/pool-recovery-prompt";
import { ClaimFeesArc } from "@/components/launchpad/claim-fees-arc";
import { StakeArc }     from "@/components/launchpad/stake-arc";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { createAdminClient } from "@/lib/supabase/server";
import { getXStockMint } from "@/lib/solana/xstocks";
import type { MarketCommentEnriched } from "@/lib/supabase/types";
import { AppIcon } from "@/components/shared/app-icon";
import { TokenDetailShell } from "@/components/launchpad/token-detail-shell";

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
      // images intentionally omitted — opengraph-image.tsx generates the dynamic card
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description,
      // images intentionally omitted — picked up from opengraph-image.tsx automatically
    },
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, isTradeable }: { status: string; isTradeable: boolean }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:    { label: "Pending",    cls: "bg-yellow-500/15 text-yellow-500 border border-yellow-500/30" },
    active:     { label: isTradeable ? "Live" : "Scheduled", cls: isTradeable ? "bg-emerald-500/15 text-up border border-emerald-500/30" : "bg-violet-500/15 text-violet-400 border border-violet-500/30" },
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
    <p className="text-[13px] font-semibold text-muted-foreground mb-3">
      {children}
    </p>
  );
}

function formatSupply(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtMcap(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

function age(d: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 3600)  return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / (86400 * 30))}mo`;
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

  const isCreator = !!walletAddress && walletAddress.toLowerCase() === token.creator_wallet?.toLowerCase();


  const initialComments = await getInitialComments(token.id, walletAddress);

  const socials = [
    { label: "Website",    href: token.website,       icon: "ti-world" },
    { label: "Twitter",    href: token.twitter,        icon: "ti-brand-x" },
    { label: "Telegram",   href: token.telegram,       icon: "ti-brand-telegram" },
    { label: "Discord",    href: token.discord,        icon: "ti-brand-discord" },
    { label: "Other",      href: token.other_social,   icon: "ti-link" },
    { label: "Whitepaper", href: token.whitepaper_url, icon: "ti-file-text" },
  ].filter(s => s.href);

  const isArc        = token.chain === "arc";
  const isPending    = token.status === "pending";
  const isOnCurve    = token.status === "active";      // bonding curve — Meteora DBC ou Arc
  const isGraduating = token.status === "graduating";  // has DAMM pool — Jupiter routable
  const isActive     = isOnCurve || isGraduating;      // generic "live" flag for chart/stats
  const isGraduated  = token.status === "graduated";
  const showChart    = !isArc && (isActive || isGraduated) && !!token.mint_address;
  const showArcChart = isArc && !!token.arc_launch_id?.startsWith("0x");
  // V4 : arc_launch_id === mint_address (le token est son propre launch ID)
  const isArcV4      = isArc
    && !!token.mint_address
    && !!token.arc_launch_id
    && token.arc_launch_id.toLowerCase() === token.mint_address.toLowerCase();

  // Birdeye uses mint address for token pages (Solana only)
  const birdeyeTokenUrl = !isArc && token.mint_address
    ? `https://birdeye.so/token/${token.mint_address}?chain=solana`
    : null;

  // Arc explorer
  const arcScanTokenUrl = isArc && token.mint_address
    ? `https://explorer.arc.io/token/${token.mint_address}`
    : null;

  const creatorInitials     = token.creator_wallet.slice(0, 2).toUpperCase();
  const creatorDisplayName  = token.creator_display_name ?? null;

  return (
    <main className="mx-auto max-w-6xl pb-44 md:pb-12">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 md:px-6">
        <Link
          href="/launchpad"
          aria-label="Back to launchpad"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted"
        >
          <ChevronLeft className="size-6" />
        </Link>
        <span className="truncate text-[15px] font-semibold text-muted-foreground">{token.ticker}</span>
        <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
          <Sprout className="size-3.5" />{age(token.created_at)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <TokenShareButton name={token.name} ticker={token.ticker} />
        </div>
      </div>

      {/* Banner — shown when set ; the creator can add or change it */}
      {token.banner_url ? (
        <div className="relative mx-4 mb-4 aspect-[3/1] overflow-hidden rounded-[22px] md:mx-6">
          <Image src={token.banner_url} alt="" fill className="object-cover" unoptimized priority role="presentation" />
          {isCreator && (
            <div className="absolute right-3 top-3">
              <BannerUploadButton tokenId={token.id} />
            </div>
          )}
        </div>
      ) : isCreator ? (
        <div className="relative mx-4 mb-4 flex aspect-[5/1] items-center justify-center overflow-hidden rounded-[22px] border border-dashed border-border bg-muted/30 md:mx-6">
          <BannerUploadButton tokenId={token.id} />
        </div>
      ) : null}

      {/* ── Token header ────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3.5 px-4 md:px-6">
        <div className="relative shrink-0">
          {token.logo_url ? (
            <Image
              src={token.logo_url}
              alt={token.name}
              width={72}
              height={72}
              className="size-[72px] rounded-[20px] object-cover ring-2 ring-primary/50"
              unoptimized
            />
          ) : (
            <div className="flex size-[72px] items-center justify-center rounded-[20px] bg-muted text-xl font-bold text-muted-foreground ring-2 ring-primary/50">
              {token.ticker.slice(0, 2)}
            </div>
          )}
          <Image
            src={isArc ? "/arc-logo.jpeg" : "/solana.png"}
            alt={isArc ? "Arc" : "Solana"}
            width={22}
            height={22}
            className="absolute -bottom-1.5 -left-1.5 rounded-full ring-[3px] ring-background"
            unoptimized
          />
        </div>

        <div className="min-w-0 flex-1 pt-1">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight text-foreground md:text-[26px]">{token.name}</h1>
            {token.is_verified && <BadgeCheck className="size-5 shrink-0 fill-primary text-background" />}
          </div>
          {token.mint_address && (
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <span className="font-mono">{shortAddr(token.mint_address, 4, 4)}</span>
              <CopyMint address={token.mint_address} />
              <a
                href={isArc
                  ? `https://explorer.arc.io/token/${token.mint_address}`
                  : `https://solscan.io/token/${token.mint_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
                title={isArc ? "View on ArcScan" : "View on Solscan"}
              >
                <ExternalLink className="size-3.5" />
              </a>
              {socials.map(s => (
                <a key={s.label} href={s.href!} target="_blank" rel="noopener noreferrer" title={s.label} className="hover:text-foreground transition-colors">
                  <AppIcon name={s.icon} className="size-3.5" />
                </a>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={token.status} isTradeable={token.is_tradeable} />
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{token.category}</span>
          </div>
        </div>

        <div className="shrink-0 pt-1 text-right">
          <p className="text-xs text-muted-foreground">MC</p>
          <p className="num text-xl font-bold text-foreground md:text-2xl">{fmtMcap(token.market_cap_usd)}</p>
        </div>
      </div>

      {/* ── Tabs + trade panel ──────────────────────────────────────────── */}
      <div className="mt-4 px-4 md:mt-6 md:px-6">
        <TokenDetailShell
          ticker={token.ticker}
          chart={
            <>
      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      {showChart && (
        <div className="-mx-4 md:mx-0">
          <TokenMarketStats mintAddress={token.mint_address!} variant="bar" chain="solana" />
        </div>
      )}
      {showArcChart && (
        <div className="-mx-4 md:mx-0">
          <TokenMarketStats mintAddress={token.arc_launch_id!} variant="bar" chain="arc" isV4={isArcV4} />
        </div>
      )}

      {/* ── Chart — full width ──────────────────────────────────────────── */}
      {showChart && (
        <div>
          <TokenChart
            mintAddress={token.mint_address!}
            name={token.name}
            ticker={token.ticker}
            logoUrl={token.logo_url ?? undefined}
          />
        </div>
      )}
      {showArcChart && (
        <div>
          <TokenChart
            arcCurveAddress={token.arc_launch_id!}
            isV4={isArcV4}
            name={token.name}
            ticker={token.ticker}
            logoUrl={token.logo_url ?? undefined}
          />
        </div>
      )}

      {isPending && (
        <div className="rounded-[22px] border border-dashed border-border px-5 py-10 text-center md:mx-6">
          <p className="text-sm font-medium text-foreground mb-1">Awaiting launch</p>
          <p className="text-xs text-muted-foreground">The chart will appear once the token is deployed on-chain.</p>
        </div>
      )}

      {isGraduated && (
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-4 text-center md:mx-6">
          <p className="text-sm font-semibold text-indigo-400">🎓 Graduated to DAMM</p>
          <p className="text-xs text-muted-foreground mt-1">This token is now fully tradeable.</p>
          {birdeyeTokenUrl && (
            <a href={birdeyeTokenUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-medium text-indigo-400 underline">
              Trade on Birdeye →
            </a>
          )}
        </div>
      )}

            </>
          }
          trade={
            <>
            {/* ── Arc bonding curve swap ── */}
            {isArc && token.mint_address && token.arc_launch_id && (
              <TokenSwapArc
                launchId={token.arc_launch_id}
                tokenAddress={token.mint_address}
                ticker={token.ticker}
                logoUrl={token.logo_url ?? undefined}
              />
            )}

            {/* Arc — claim creator fees (new contract only).
                Le composant gère lui-même le check isCreator côté client
                avec l'adresse EVM MetaMask — pas de guard serveur ici
                car creator_wallet peut être une adresse Solana (anciens tokens). */}
            {isArc && token.arc_launch_id?.startsWith("0x") && token.arc_launch_id.length === 42 && (
              <ClaimFeesArc
                curveAddress={token.arc_launch_id}
                tokenAddress={token.mint_address ?? undefined}
                creatorWallet={token.creator_wallet}
              />
            )}

            {/* Arc V4 — holder staking rewards (FeeDistributor).
                Component self-hides when feeDistributor === address(0). */}
            {isArcV4 && token.mint_address && (
              <StakeArc
                tokenAddress={token.mint_address}
                ticker={token.ticker}
                logoUrl={token.logo_url ?? undefined}
              />
            )}

            {/* Arc — link to ArcScan */}
            {isArc && arcScanTokenUrl && (
              <a
                href={arcScanTokenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-2xl bg-muted px-5 py-3 text-sm font-bold text-foreground hover:bg-muted/70 transition-colors"
              >
                View on ArcScan →
              </a>
            )}

            {/* ── Solana bonding curve (active or graduating with DBC pool) ── */}
            {!isArc && (isOnCurve || isGraduating) && token.is_tradeable && token.pool_address && token.mint_address && (
              <TokenSwapDBC
                poolAddress={token.pool_address}
                mintAddress={token.mint_address}
                ticker={token.ticker}
                logoUrl={token.logo_url ?? undefined}
                stockSymbol={token.stock_symbol ?? undefined}
                quoteMintAddress={token.stock_symbol ? (getXStockMint(token.stock_symbol) ?? undefined) : undefined}
              />
            )}

            {/* ── Solana active but pool_address missing — recovery prompt ── */}
            {!isArc && isOnCurve && token.is_tradeable && !token.pool_address && isCreator && (
              <PoolRecoveryPrompt tokenId={token.id} walletAddress={token.creator_wallet} />
            )}
            {!isArc && isOnCurve && token.is_tradeable && !token.pool_address && !isCreator && (
              <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center space-y-1">
                <p className="text-sm font-medium text-foreground">Pool indexing…</p>
                <p className="text-xs text-muted-foreground">The swap will appear shortly.</p>
              </div>
            )}

            {/* Graduated — Jupiter Terminal (DAMM pool, fully indexed) */}
            {!isArc && isGraduated && token.mint_address && (
              <TokenSwapJupiter
                mintAddress={token.mint_address}
              />
            )}

            {/* Graduated — also link to Birdeye */}
            {!isArc && isGraduated && birdeyeTokenUrl && (
              <a
                href={birdeyeTokenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-2xl bg-muted px-5 py-3 text-sm font-bold text-foreground hover:bg-muted/70 transition-colors"
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

            {/* Claim fees — creator only, Solana tokens only (Arc uses ClaimFeesArc above) */}
            {!isArc && isCreator && (isActive || isGraduated) && (
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
            </>
          }
          comments={
            <LaunchpadComments
              tokenId={token.id}
              initialComments={initialComments}
              isAuthenticated={!!walletAddress}
              walletAddress={walletAddress}
            />
          }
          about={
            <div className="space-y-6">
              {token.description && (
                <p className="text-[15px] leading-relaxed text-muted-foreground">{token.description}</p>
              )}
              {showChart && token.mint_address && (
                <TokenTradeStats mintAddress={token.mint_address} />
              )}
          {/* Token info */}
          <div>
            <SectionLabel>Token info</SectionLabel>
            <InfoRow label="Network" value={isArc ? "Arc" : "Solana"} />
            <InfoRow label="Supply"  value={formatSupply(token.supply)} />
            {token.first_buy_amount && (
              <InfoRow label="First buy" value={`${token.first_buy_amount} ${isArc ? "USDC" : "SOL"}`} />
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
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center rounded-md bg-up/12 px-2 py-0.5 text-[11px] font-semibold text-up shrink-0">
                    1% fees
                  </span>
                  <a
                    href={`/profile/${token.creator_wallet}`}
                    className="block hover:text-primary transition-colors min-w-0"
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
          }
        />
      </div>
    </main>
  );
}
