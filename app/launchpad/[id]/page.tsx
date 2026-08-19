import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
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
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { createAdminClient } from "@/lib/supabase/server";
import type { MarketCommentEnriched } from "@/lib/supabase/types";

export const revalidate = 30;

type Props = { params: Promise<{ id: string }> };

// ── Comments loader ───────────────────────────────────────────────────────────

async function getInitialComments(tokenId: string, wallet: string | null): Promise<MarketCommentEnriched[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: rows } = await admin
    .from("launchpad_comments")
    .select("*")
    .eq("token_id", tokenId)
    .order("created_at", { ascending: true });

  const comments = (rows ?? []) as Array<Record<string, unknown>>;

  let likedSet = new Set<string>();
  if (wallet) {
    const { data: likes } = await admin
      .from("launchpad_comment_likes")
      .select("comment_id")
      .eq("wallet_address", wallet);
    likedSet = new Set((likes ?? []).map((l: { comment_id: string }) => l.comment_id));
  }

  // Launchpad comments do not use OCTO balance (prediction-market concept).
  // octo_balance is set to 0 for all commenters.
  const likeCountMap: Record<string, number> = {};
  if (comments.length > 0) {
    const { data: likeCounts } = await admin
      .from("launchpad_comment_likes")
      .select("comment_id")
      .in("comment_id", comments.map(c => c.id));
    for (const row of (likeCounts ?? []) as { comment_id: string }[]) {
      likeCountMap[row.comment_id] = (likeCountMap[row.comment_id] ?? 0) + 1;
    }
  }

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
      octo_balance:   0, // launchpad has no OCTO concept
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
  const token = id.length > 36 ? await getLaunchpadTokenByMint(id) : await getLaunchpadToken(id);
  if (!token) return { title: "Token not found" };
  return {
    title: `${token.name} ($${token.ticker}) — Launchpad`,
    description: token.description ?? `${token.name} on OMdotfun Launchpad`,
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
    id.length > 36 ? getLaunchpadTokenByMint(id) : getLaunchpadToken(id),
    getWalletAddress(),
  ]);
  if (!token) notFound();

  const isCreator  = walletAddress === token.creator_wallet;

  if (id.length <= 36 && token.mint_address) {
    redirect(`/launchpad/${token.mint_address}`);
  }

  const initialComments = await getInitialComments(token.id, walletAddress);

  const socials = [
    { label: "Website",  href: token.website,     icon: "ti-world" },
    { label: "Twitter",  href: token.twitter,      icon: "ti-brand-x" },
    { label: "Telegram", href: token.telegram,     icon: "ti-brand-telegram" },
    { label: "Discord",  href: token.discord,      icon: "ti-brand-discord" },
    { label: "Other",    href: token.other_social, icon: "ti-link" },
    { label: "Whitepaper", href: token.whitepaper_url, icon: "ti-file-text" },
  ].filter(s => s.href);

  const isPending   = token.status === "pending";
  const isActive    = token.status === "active" || token.status === "graduating";
  const isGraduated = token.status === "graduated";
  const showChart   = (isActive || isGraduated) && !!token.mint_address;

  const creatorInitials = token.creator_wallet.slice(0, 2).toUpperCase();

  return (
    <main className="mx-auto max-w-5xl">

      {/* ── Hero banner ─────────────────────────────────────────────────────── */}
      {/* Outer: positioning context, no overflow clip so avatar can overflow */}
      <div className="relative h-36 md:h-48">

        {/* Inner: background clipped */}
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

        {/* Floating avatar — overflows hero downward freely */}
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

        {/* Right: socials */}
        {socials.length > 0 && (
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
          </div>
        )}
      </div>

      {/* ── Stats bar (full-width, borderless) ──────────────────────────────── */}
      {showChart && (
        <div className="mt-4">
          <TokenMarketStats mintAddress={token.mint_address!} variant="bar" />
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="mt-6 px-4 md:px-6 pb-10 grid gap-8 md:grid-cols-[1fr_280px] items-start">

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="space-y-8">

          {/* Chart */}
          {showChart && (
            <TokenChart mintAddress={token.mint_address!} name={token.name} />
          )}

          {/* Trade stats */}
          {showChart && token.mint_address && (
            <TokenTradeStats mintAddress={token.mint_address} />
          )}

          {/* Pending placeholder */}
          {isPending && (
            <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
              <p className="text-sm font-medium text-foreground mb-1">Awaiting launch</p>
              <p className="text-xs text-muted-foreground">The chart will appear once the token is deployed on-chain.</p>
            </div>
          )}

          {/* Graduated banner */}
          {isGraduated && (
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-4 text-center">
              <p className="text-sm font-semibold text-indigo-400">🎓 Graduated to DAMM</p>
              <p className="text-xs text-muted-foreground mt-1">This token is now fully tradeable.</p>
              {token.pool_address && (
                <a
                  href={`https://birdeye.so/token/${token.pool_address}?chain=solana`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-indigo-400 underline"
                >
                  Trade on Birdeye →
                </a>
              )}
            </div>
          )}

          {/* Description */}
          {token.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {token.description}
            </p>
          )}

          {/* Comments */}
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

        {/* ── Right sidebar — no card borders ─────────────────────────────── */}
        <div className="space-y-6">

          {/* CTA — toujours en premier */}
          <div className="space-y-2">
            {isActive && token.is_tradeable && token.pool_address && (
              <a
                href={`https://birdeye.so/token/${token.pool_address}?chain=solana`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors"
              >
                Trade on Birdeye →
              </a>
            )}
            <WatchlistButton tokenId={token.id} />

            {isPending && (
              <div className="space-y-3 pt-1">
                <LaunchButton
                  tokenId={token.id}
                  walletAddress={token.creator_wallet}
                  isScheduled={token.is_scheduled}
                />
              </div>
            )}

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

          {/* Token info — no card, sections séparées par des lignes */}
          <div>
            <SectionLabel>Token info</SectionLabel>
            <InfoRow label="Network"    value="Solana" />
            <InfoRow label="Supply"     value={formatSupply(token.supply)} />
            <InfoRow label="Fees"       value="3% per trade (1% creator · 2% platform)" />
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
                  className="font-mono text-[11px] text-foreground hover:text-primary transition-colors break-all"
                >
                  {shortAddr(token.creator_wallet, 6, 6)}
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
