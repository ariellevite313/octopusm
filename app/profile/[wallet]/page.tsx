import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/services/profile-service";
import { ProfilePnlChart } from "@/components/profile/profile-pnl-chart";
import { ProfileActivityList } from "@/components/profile/profile-activity-list";
import { ProfileMarketsList } from "@/components/profile/profile-markets-list";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmt(n: number, decimals = 2) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)    return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(decimals);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// X (Twitter) logo SVG
function XLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-label="X (Twitter)">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const { wallet } = await params;

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    notFound();
  }

  const data = await getPublicProfile(wallet);

  const displayName = data.wallet?.display_name ?? shortAddress(wallet);
  const avatarSrc   = data.wallet?.avatar_src ?? null;
  const joinedAt    = data.wallet?.created_at ?? null;

  const totalUsdc = data.pnl_series.at(-1)?.usdc ?? 0;
  const totalClt  = data.pnl_series.at(-1)?.clt  ?? 0;

  const totalVolume = data.volume.usdc + data.volume.clt;
  const usdcPct = totalVolume > 0 ? Math.round((data.volume.usdc / totalVolume) * 100) : 0;
  const cltPct  = totalVolume > 0 ? 100 - usdcPct : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">

        {/* ── 1. Identity card ─────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-4">

            {/* Avatar */}
            {avatarSrc ? (
              <Image
                src={avatarSrc}
                alt={displayName}
                width={56}
                height={56}
                className="size-14 shrink-0 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xl font-bold text-orange-600 ring-2 ring-border dark:bg-orange-900/30 dark:text-orange-400">
                {displayName[0].toUpperCase()}
              </div>
            )}

            {/* Name + meta */}
            <div className="min-w-0 flex-1">
              {/* Name + OCTO badge */}
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-base font-semibold text-foreground">
                  {displayName}
                </h1>
                <OctoBadge totalOcto={data.stats.octo_balance} size={16} />
              </div>

              {/* Wallet address (only if display name differs) */}
              {data.wallet?.display_name && (
                <p className="font-mono text-xs text-muted-foreground">
                  {shortAddress(wallet)}
                </p>
              )}

              {/* Tags */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {joinedAt && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    Member since {fmtDate(joinedAt)}
                  </span>
                )}
                {/* Twitter: logo only */}
                {data.wallet?.twitter_handle && (
                  <a
                    href={`https://twitter.com/${data.wallet.twitter_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`@${data.wallet.twitter_handle}`}
                    className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-foreground hover:text-background"
                  >
                    <XLogo size={12} />
                  </a>
                )}
              </div>
            </div>

            {/* Rank */}
            {data.stats.rank && (
              <div className="shrink-0 text-right">
                <p className="text-[10px] text-muted-foreground">Rank</p>
                <p className="text-2xl font-bold text-orange-500">#{data.stats.rank}</p>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-4">
            <div className="px-2 text-center">
              <p className="text-[10px] text-muted-foreground">Rounds</p>
              <p className="text-lg font-semibold text-foreground">{data.stats.total_rounds}</p>
            </div>
            <div className="px-2 text-center">
              <p className="text-[10px] text-muted-foreground">Win rate</p>
              <p className="text-lg font-semibold text-emerald-600">{data.stats.win_rate}%</p>
            </div>
            <div className="px-2 text-center">
              <p className="text-[10px] text-muted-foreground">OCTO</p>
              <p className="text-lg font-semibold text-foreground">{fmt(data.stats.octo_balance, 0)}</p>
            </div>
          </div>

          {/* Volume bars */}
          {totalVolume > 0 && (
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Volume by token
              </p>
              {data.volume.usdc > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Image src="/usdc-coin.png" alt="USDC" width={13} height={13} className="rounded-full" />
                      USDC
                    </span>
                    <span className="text-muted-foreground">
                      ${fmt(data.volume.usdc)} <span className="text-[10px]">{usdcPct}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${usdcPct}%` }} />
                  </div>
                </div>
              )}
              {data.volume.clt > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Image src="/clawdtrust-coin.png" alt="ClawdTrust" width={13} height={13} className="rounded-full" />
                      ClawdTrust
                    </span>
                    <span className="text-muted-foreground">
                      {fmt(data.volume.clt)} CLT <span className="text-[10px]">{cltPct}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${cltPct}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 2. P&L Chart ────────────────────────────────────────────── */}
        <ProfilePnlChart
          series={data.pnl_series}
          totalUsdc={totalUsdc}
          totalClt={totalClt}
        />

        {/* ── 3. Recent activity (paginated client component) ─────────── */}
        <ProfileActivityList items={data.activity} />

        {/* ── 4. Markets created (paginated client component) ──────────── */}
        <ProfileMarketsList markets={data.created_markets} />

        {/* Empty state */}
        {data.stats.total_rounds === 0 && data.created_markets.length === 0 && (
          <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
            <p className="text-muted-foreground">No activity yet for this address.</p>
          </div>
        )}

      </div>
    </div>
  );
}
