"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

// Tableau de bord du launchpad sur ordinateur : bandeau des meilleurs
// créateurs, puis le bouton du hackathon (le Trending est dans TrendingStrip, commun mobile/ordinateur).

function sol(n: number) { return n >= 1 ? n.toFixed(2) : n.toFixed(4); }
function short(a: string) { return `${a.slice(0, 4)}…${a.slice(-4)}`; }

export function LaunchpadBoard() {
  const { tr } = useT();
  const [leaders, setLeaders]   = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    fetch("/api/leaderboard?period=all").then(r => r.ok ? r.json() : { entries: [] })
      .then((d: { entries?: LeaderboardEntry[] }) => setLeaders(d.entries ?? [])).catch(() => setLeaders([]));
  }, []);

  const tickerItems = (leaders ?? []).slice(0, 10);

  return (
    <div className="mb-2">
      {/* Top creators ticker */}
      {tickerItems.length > 0 && (
        <div className="ticker-mask -mx-4 mb-5 overflow-hidden lg:mx-0 border-y border-border/60 py-2.5">
          <div className="ticker-track flex w-max gap-8">
            {[...tickerItems, ...tickerItems].map((e, i) => (
              <Link key={`${e.walletAddress}-${i}`} href={`/profile/${e.walletAddress}`} className="flex shrink-0 items-center gap-2 text-sm">
                {e.avatarSrc
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={e.avatarSrc} alt="" className="size-5 rounded-[6px] object-cover" />
                  : <span className="flex size-5 items-center justify-center rounded-[6px] bg-primary/20 text-[9px] font-bold text-primary">{(e.displayName ?? e.walletAddress).slice(0, 1)}</span>}
                <span className="font-semibold text-foreground">@{e.displayName ?? short(e.walletAddress)}</span>
                <span className="num font-bold text-up">+{e.usdValue != null ? `$${e.usdValue.toFixed(2)}` : e.currency === "USDC" ? `${(e.totalFee ?? 0).toFixed(2)} USDC` : `${sol(e.totalFeeSol)} SOL`}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Accès direct au hackathon, juste sous le bandeau des gagnants (blanc sur fond sombre, noir sur fond clair) */}
      <Link href="/hackathon" className="mb-5 flex h-12 w-full items-center justify-center rounded-2xl bg-foreground text-[15px] font-bold text-background transition-opacity hover:opacity-90">
        {tr("Join the hackathon")}
      </Link>
    </div>
  );
}
