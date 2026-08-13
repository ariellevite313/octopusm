import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getLaunchpadToken, getLaunchpadTokenByMint } from "@/services/launchpad-service";
import { LaunchButton } from "@/components/launchpad/launch-button";
import { WatchlistButton } from "@/components/launchpad/watchlist-button";
import { EditTokenButton } from "@/components/launchpad/edit-token-button";

// Revalidate every 30s — status changes after on-chain confirmation
export const revalidate = 30;

type Props = { params: Promise<{ id: string }> };

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
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground text-right">{value}</span>
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
  // Mint address = base58, ~44 chars. UUID = 36 chars with dashes.
  const token = id.length > 36 ? await getLaunchpadTokenByMint(id) : await getLaunchpadToken(id);
  if (!token) notFound();

  // If accessed by UUID and token has a mint address, redirect to canonical CA URL
  if (id.length <= 36 && token.mint_address) {
    redirect(`/launchpad/${token.mint_address}`);
  }

  const socials = [
    { label: "Website",  href: token.website,      icon: "ti-world" },
    { label: "Twitter",  href: token.twitter,       icon: "ti-brand-x" },
    { label: "Telegram", href: token.telegram,      icon: "ti-brand-telegram" },
    { label: "Discord",  href: token.discord,       icon: "ti-brand-discord" },
    { label: "Other",    href: token.other_social,  icon: "ti-link" },
  ].filter(s => s.href);

  const isPending   = token.status === "pending";
  const isActive    = token.status === "active" || token.status === "graduating";
  const isGraduated = token.status === "graduated";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* ── Back ── */}
      <Link href="/launchpad" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
        ← Launchpad
      </Link>

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_320px]">

        {/* ── Left column ── */}
        <div className="space-y-5">

          {/* Header */}
          <div className="flex items-start gap-4">
            {token.logo_url ? (
              <Image
                src={token.logo_url}
                alt={token.name}
                width={64}
                height={64}
                className="rounded-2xl object-cover shrink-0"
                unoptimized
              />
            ) : (
              <div className="flex size-16 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/30 text-2xl font-bold text-violet-600 dark:text-violet-400 shrink-0">
                {token.ticker.slice(0, 2)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">{token.name}</h1>
                <span className="text-sm text-muted-foreground">${token.ticker}</span>
                <StatusBadge status={token.status} isTradeable={token.is_tradeable} />
                <EditTokenButton token={{
                  id: token.id,
                  creator_wallet: token.creator_wallet,
                  name: token.name,
                  ticker: token.ticker,
                  description: token.description,
                  category: token.category,
                  logo_url: token.logo_url,
                  whitepaper_url: token.whitepaper_url,
                  website: token.website,
                  twitter: token.twitter,
                  telegram: token.telegram,
                  discord: token.discord,
                  other_social: token.other_social,
                  status: token.status,
                }} />
              </div>
              <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {token.category}
              </span>
            </div>
          </div>

          {/* Description */}
          {token.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{token.description}</p>
          )}

          {/* Socials */}
          {socials.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {socials.map(s => (
                <a
                  key={s.label}
                  href={s.href!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <i className={`ti ${s.icon} text-sm`} aria-hidden /> {s.label}
                </a>
              ))}
            </div>
          )}

          {/* Mint address */}
          {token.mint_address && isActive && (
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Contract address (CA)</p>
              <a
                href={`https://solscan.io/token/${token.mint_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-violet-600 dark:text-violet-400 break-all hover:underline"
              >
                {token.mint_address}
              </a>
            </div>
          )}

          {/* Pool address (post-launch) */}
          {token.pool_address && (
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Pool</p>
              <a
                href={`https://birdeye.so/token/${token.pool_address}?chain=solana`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-blue-600 dark:text-blue-400 break-all hover:underline"
              >
                {token.pool_address}
              </a>
            </div>
          )}

          {/* Birdeye chart — shown for active/graduated tokens with a mint address */}
          {(isActive || isGraduated) && token.mint_address && (
            <div className="rounded-2xl border border-border overflow-hidden">
              <iframe
                src={`https://birdeye.so/tv-widget/${token.mint_address}?chain=solana&viewMode=pair&chartType=CANDLE&chartInterval=15&chartLeftToolbar=show&theme=dark`}
                style={{ width: "100%", height: "500px", border: "none" }}
                title={`${token.name} price chart`}
                allowFullScreen
              />
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
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">

          {/* Token info card */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Token Info</p>
            <InfoRow label="Supply"       value={formatSupply(token.supply)} />
            <InfoRow label="Trading fee"  value="2.5% per trade" />
            {token.first_buy_amount && (
              <InfoRow label="First buy" value={`${token.first_buy_amount} SOL`} />
            )}
            {token.is_scheduled && token.scheduled_at && (
              <InfoRow
                label="Launch date"
                value={new Date(token.scheduled_at).toLocaleString()}
              />
            )}
            {token.share_top100 && token.share_top100_pct && (
              <InfoRow label="Top 100 share" value={`${token.share_top100_pct}% of creator fees`} />
            )}
          </div>

          {/* Creator */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Creator</p>
            <a
              href={`/profile/${token.creator_wallet}`}
              className="font-mono text-xs text-foreground hover:text-primary transition-colors break-all"
            >
              {token.creator_wallet}
            </a>
          </div>

          {/* Whitepaper */}
          {token.whitepaper_url && (
            <a
              href={token.whitepaper_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              📄 Whitepaper PDF
            </a>
          )}

          {/* Watchlist */}
          <WatchlistButton tokenId={token.id} />

          {/* Launch button — only shown for pending tokens */}
          {isPending && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Launch</p>
              <LaunchButton
                tokenId={token.id}
                walletAddress={token.creator_wallet}
                isScheduled={token.is_scheduled}
              />
            </div>
          )}

          {/* Trade button for live tokens */}
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
        </div>
      </div>
    </main>
  );
}
