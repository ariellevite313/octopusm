import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, ArrowLeft } from "lucide-react";
import type { LeaderboardResponse, LeaderboardEntry } from "@/app/api/leaderboard/route";

export const metadata: Metadata = {
  title: "Leaderboard — OMdotfun",
  description: "Top token creators ranked by fees earned on OMdotfun.",
};

export const revalidate = 60;

function short(addr: string) {
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

function fmtSol(n: number) {
  if (n === 0) return "0 SOL";
  if (n >= 1) return `${n.toFixed(4)} SOL`;
  return `${n.toFixed(6)} SOL`;
}

const MEDAL = ["🥇", "🥈", "🥉"];

function PodiumCard({ entry }: { entry: LeaderboardEntry }) {
  const heights = ["h-28", "h-20", "h-16"];
  const sizes   = ["text-3xl", "text-2xl", "text-xl"];
  const idx     = entry.rank - 1;

  return (
    <div className="flex flex-col items-center gap-2">
      <span className={`${sizes[idx]} font-bold text-foreground`}>{MEDAL[idx]}</span>
      <div className="flex flex-col items-center">
        <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
          {entry.walletAddress.slice(0, 2).toUpperCase()}
        </div>
        <p className="mt-1 text-xs font-mono text-foreground">{short(entry.walletAddress)}</p>
        <p className="text-xs font-bold text-primary">{fmtSol(entry.totalFeeSol)}</p>
      </div>
      <div
        className={`w-20 ${heights[idx]} rounded-t-xl flex items-end justify-center pb-2 text-xs font-bold text-white ${
          idx === 0 ? "bg-amber-400" : idx === 1 ? "bg-zinc-400" : "bg-amber-700"
        }`}
      >
        #{entry.rank}
      </div>
    </div>
  );
}

async function getLeaderboard(): Promise<LeaderboardResponse> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://omdot.fun";
  const res  = await fetch(`${base}/api/leaderboard`, { next: { revalidate: 60 } });
  if (!res.ok) return { entries: [], updatedAt: new Date().toISOString() };
  return res.json() as Promise<LeaderboardResponse>;
}

export default async function LeaderboardPage() {
  const { entries } = await getLeaderboard();
  const top3 = entries.slice(0, 3);
  const rest  = entries.slice(3);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">

      {/* Back */}
      <Link
        href="/launchpad"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Launchpad
      </Link>

      {/* Title */}
      <div className="mb-8 flex items-center gap-2">
        <Trophy className="size-5 text-amber-400" />
        <h1 className="text-xl font-bold text-foreground">Creator Leaderboard</h1>
      </div>

      {entries.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-16">
          No claims yet — be the first to launch and earn fees.
        </p>
      ) : (
        <>
          {/* Podium */}
          {top3.length >= 3 && (
            <div className="mb-10 flex items-end justify-center gap-4">
              {/* 2nd — 1st — 3rd order for visual podium */}
              {[top3[1], top3[0], top3[2]].filter(Boolean).map(e => (
                <PodiumCard key={e.walletAddress} entry={e} />
              ))}
            </div>
          )}

          {/* Table */}
          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["#", "Creator", "Tokens", "Claims", "Total earned"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map(entry => (
                  <tr key={entry.walletAddress} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs font-bold text-muted-foreground w-8">
                      {entry.rank <= 3 ? MEDAL[entry.rank - 1] : `#${entry.rank}`}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {short(entry.walletAddress)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {entry.tokenCount}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {entry.claimCount}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-primary">
                      {fmtSol(entry.totalFeeSol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
