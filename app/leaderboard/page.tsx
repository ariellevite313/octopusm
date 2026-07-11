import type { Metadata } from "next";
import Image from "next/image";
import { getLeaderboard } from "@/services/leaderboard-service";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Top OCTO holders on Octo Market. Rank up by winning prediction markets and pool bets on Solana.",
  openGraph: {
    title: "Octo Market — Leaderboard",
    description: "Top OCTO holders ranked by winnings on Solana prediction markets.",
    url: "/leaderboard",
    type: "website",
    images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: "Octo Market" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Octo Market — Leaderboard",
    description: "Top OCTO holders ranked by winnings.",
    images: ["/branding-logo.jpeg"],
  },
};

// ISR : revalidation toutes les 5 minutes
export const revalidate = 300;

const OCTO_LOGO = "/octo-coin.png";

function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function formatOcto(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export default async function LeaderboardPage() {
  const entries = await getLeaderboard(50);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">

      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Image src={OCTO_LOGO} alt="Octopus" width={36} height={36} className="shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">OCTO Leaderboard</h1>
          <p className="text-sm text-muted-foreground">{entries.length} participants ranked</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No results yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.wallet_address}
              className={`flex items-center gap-4 rounded-2xl border px-4 py-3 transition-colors ${
                entry.rank <= 3
                  ? "border-orange-200 bg-orange-50/60 dark:border-orange-900/50 dark:bg-orange-950/10"
                  : "border-border bg-card"
              }`}
            >
              {/* Rank */}
              <span className={`w-8 shrink-0 text-center text-sm font-bold ${
                entry.rank === 1 ? "text-yellow-500" :
                entry.rank === 2 ? "text-zinc-400" :
                entry.rank === 3 ? "text-amber-600" :
                "text-muted-foreground"
              }`}>
                {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
              </span>

              {/* Avatar */}
              {entry.avatar_src ? (
                <Image
                  src={entry.avatar_src}
                  alt={entry.display_name ?? entry.wallet_address}
                  width={36}
                  height={36}
                  className="size-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                  {(entry.display_name ?? entry.wallet_address)[0].toUpperCase()}
                </div>
              )}

              {/* Name + badge */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-foreground">
                  {entry.display_name ?? shortAddress(entry.wallet_address)}
                </span>
                <OctoBadge totalOcto={entry.total_octo} size={14} />
              </div>

              {/* Wins */}
              <span className="shrink-0 text-xs text-muted-foreground">
                {entry.win_count} win{entry.win_count !== 1 ? "s" : ""}
              </span>

              {/* OCTO */}
              <div className="flex shrink-0 items-center gap-1">
                <Image src={OCTO_LOGO} alt="" width={14} height={14} className="opacity-80" />
                <span className="text-sm font-bold text-foreground">{formatOcto(entry.total_octo)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
