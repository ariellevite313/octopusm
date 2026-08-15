import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getLaunchpadToken, getLaunchpadTokenByMint } from "@/services/launchpad-service";
import { LaunchButton } from "@/components/launchpad/launch-button";
import { WatchlistButton } from "@/components/launchpad/watchlist-button";
import { TokenChart } from "@/components/launchpad/token-chart";
import { TokenMarketStats } from "@/components/launchpad/token-market-stats";
import { ClaimFeesButton } from "@/components/dashboard/claim-fees-button";
import { LaunchpadComments } from "@/components/launchpad/launchpad-comments";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { createAdminClient } from "@/lib/supabase/server";
import type { MarketCommentEnriched } from "@/lib/supabase/types";

export const revalidate = 30;

type Props = { params: Promise<{ id: string }> };

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

  const uniqueWallets = [...new Set(comments.map(c => c.wallet_address as string))];
  const octoMap: Record<string, number> = {};
  if (uniqueWallets.length > 0) {
    const { data: octoRows } = await admin
      .from("octo_transactions")
      .select("wallet_address, amount")
      .in("wallet_address", uniqueWallets);
    for (const row of (octoRows ?? []) as { wallet_address: string; amount: number }[]) {
      octoMap[row.wallet_address] = (octoMap[row.wallet_address] ?? 0) + (row.amount ?? 0);
    }
  }

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const token = id.length > 36 ? await getLaunchpadTokenByMint(id) : await getLaunchpadToken(id);
  if (!token) return { title: "Token not found" };
  return {
    title: `${token.name} ($${token.ticker}) — Launchpad`,
    description: token.description ?? `${token.name} on OMdotfun Launchpad`,
  };
}

function StatusBadge({ status, isTradeable }: { status: string; isTradeable: boolean }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:    { label: "Pending",    cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
    active:     { label: isTradeable ? "Live" : "Scheduled", cls: isTradeable ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
    graduating: { label: "Graduating", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    graduated:  { label: "Graduated",  cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
    cancelled:  { label: "Cancelled",  cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground text-right max-w-[60%] break-all">{value}</span>
    </div>
  );
}

function formatSupply(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(0)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)}M`;
  return n.toLocaleString();
}

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
  ].filter(s => s.href);

  const isPending   = token.status === "pending";
  const isActive    = token.status === "active" || token.status === "graduating";
  const isGraduated = token.status === "graduated";
  const showChart   = (isActive || isGraduated) && !!token.mint_address;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">

      {/* ── Back ── */}
      <Link href="/launchpad" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
        ← Launchpad
      </Link>

      {/* ══════════════════════════════════════════
          HEADER — pleine largeur
      ══════════════════════════════════════════ */}
      <div className="mt-4 rounded-2xl border border-border bg-card px-5 py-4 flex items-center justify-between gap-4 flex-wrap">

        {/* Gauche : avatar + nom + badges */}
        <div className="flex items-center gap-4 min-w-0">
          {token.logo_url ? (
            <Image
              src={token.logo_url}
              alt={token.name}
              width={52}
              height={52}
              className="rounded-xl object-cover shrink-0"
              unoptimized
            />
          ) : (
            <div className="flex size-[52px] items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30 text-lg font-bold text-violet-600 dark:text-violet-400 shrink-0">
              {token.ticker.slice(0, 2)}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-lg font-semibold text-foreground">{token.name}</h1>
              <span className="text-sm text-muted-foreground">${token.ticker}</span>
              <StatusBadge status={token.status} isTradeable={token.is_tradeable} />
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {token.category}
              </span>
            </div>

            {/* Mint address inline */}
            {token.mint_address && (
              <div className="flex items-center gap-1.5">
                <a
                  href={`https://solscan.io/token/${token.mint_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                >
                  {token.mint_address.slice(0, 6)}…{token.mint_address.slice(-6)}
                </a>
                <i className="ti ti-external-link text-[11px] text-muted-foreground" aria-hidden />
              </div>
            )}
          </div>
        </div>

        {/* Droite : socials + pool link */}
        <div className="flex items-center gap-3 shrink-0">
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
          {token.whitepaper_url && (
            <a
              href={token.whitepaper_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Whitepaper"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <i className="ti ti-file-text text-base" aria-hidden />
            </a>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          BODY — chart gauche + sidebar droite
      ══════════════════════════════════════════ */}
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_268px] items-start">

        {/* ── Colonne gauche ── */}
        <div className="space-y-4">

          {/* Chart */}
          {showChart && (
            <TokenChart mintAddress={token.mint_address!} name={token.name} />
          )}

          {/* Pending — pas de chart */}
          {isPending && (
            <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center">
              <p className="text-sm font-semibold text-foreground mb-1">Waiting for launch</p>
              <p className="text-xs text-muted-foreground">The chart will appear once the token is live on-chain.</p>
            </div>
          )}

          {/* Graduated banner */}
          {isGraduated && (
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-4 text-center">
              <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">🎓 Graduated to DAMM</p>
              <p className="text-xs text-muted-foreground mt-1">This token has graduated and is now fully tradeable.</p>
              {token.pool_address && (
                <a
                  href={`https://birdeye.so/token/${token.pool_address}?chain=solana`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-indigo-600 dark:text-indigo-400 underline"
                >
                  Trade on Birdeye →
                </a>
              )}
            </div>
          )}

          {/* Description */}
          {token.description && (
            <p className="text-sm text-muted-foreground leading-relaxed px-1">
              {token.description}
            </p>
          )}

          {/* Comments */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <LaunchpadComments
              tokenId={token.id}
              initialComments={initialComments}
              isAuthenticated={!!walletAddress}
              walletAddress={walletAddress}
            />
          </div>
        </div>

        {/* ── Sidebar droite ── */}
        <div className="space-y-3">

          {/* Market stats (price, mcap, fdv, vol, holders) */}
          {showChart && (
            <TokenMarketStats mintAddress={token.mint_address!} />
          )}

          {/* Token info + creator */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Token info</p>
            <InfoRow label="Network"      value="Solana" />
            <InfoRow label="Supply"       value={formatSupply(token.supply)} />
            <InfoRow label="Trading fee"  value="2.5% per trade" />
            {token.first_buy_amount && (
              <InfoRow label="First buy"  value={`${token.first_buy_amount} SOL`} />
            )}
            {token.is_scheduled && token.scheduled_at && (
              <InfoRow label="Launch date" value={new Date(token.scheduled_at).toLocaleString()} />
            )}
            {token.share_top100 && token.share_top100_pct && (
              <InfoRow label="Top 100 share" value={`${token.share_top100_pct}% of creator fees`} />
            )}
            <div className="pt-2 mt-1 border-t border-border">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 mt-1">Creator</p>
              <a
                href={`/profile/${token.creator_wallet}`}
                className="font-mono text-[11px] text-foreground hover:text-primary transition-colors break-all"
              >
                {token.creator_wallet}
              </a>
            </div>
            {/* Pool address */}
            {token.pool_address && (
              <div className="pt-2 mt-1 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 mt-1">Pool</p>
                <a
                  href={`https://birdeye.so/token/${token.pool_address}?chain=solana`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-blue-600 dark:text-blue-400 break-all hover:underline"
                >
                  {token.pool_address.slice(0, 8)}…{token.pool_address.slice(-8)}
                </a>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2">

            {/* Watchlist */}
            <WatchlistButton tokenId={token.id} />

            {/* Trade */}
            {isActive && token.is_tradeable && token.pool_address && (
              <a
                href={`https://birdeye.so/token/${token.pool_address}?chain=solana`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Trade on Birdeye →
              </a>
            )}

            {/* Launch — pending only */}
            {isPending && (
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Launch</p>
                <LaunchButton
                  tokenId={token.id}
                  walletAddress={token.creator_wallet}
                  isScheduled={token.is_scheduled}
                />
              </div>
            )}

            {/* Claim fees — creator only */}
            {isCreator && (isActive || isGraduated) && (
              <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Creator fees</p>
                <p className="text-xs text-muted-foreground">Claim your accumulated trading fees from the pool.</p>
                <ClaimFeesButton
                  tokenId={token.id}
                  walletAddress={token.creator_wallet}
                  poolAddress={token.pool_address ?? ""}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
