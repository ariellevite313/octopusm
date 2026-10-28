"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";
import { HACKATHON, hackathonPhase } from "@/lib/hackathon/config";
import type { BoardRow } from "@/lib/hackathon/leaderboard";
import { useBoard, useMyVotes, usd0, usd2, compact, CATEGORY_LABEL } from "./use-hackathon";
import { VoteSheet } from "./vote-sheet";

type Sort = "score" | "volume" | "votes" | "holders" | "new";
const SORTS: { id: Sort; label: string }[] = [
  { id: "score", label: T("Score") }, { id: "volume", label: T("Volume") }, { id: "votes", label: T("Votes") },
  { id: "holders", label: T("Holders") }, { id: "new", label: T("New") },
];
const REASON: Record<string, string> = {
  holders: T("not enough holders"), concentration: T("top holders own too much"), biggest_holder: T("one wallet owns too much"),
  bundle: T("bundled purchases"), price: T("price too low"), volume: T("no recent volume"), frozen_tokens: T("frozen tokens moved"),
};

export function LeaderboardView() {
  const { tr } = useT();
  const { data: board, error } = useBoard();
  const { data: mine } = useMyVotes();
  const [sort, setSort] = useState<Sort>("score");
  const [open, setOpen] = useState<string | null>(null);
  const [voting, setVoting] = useState<BoardRow | null>(null);
  const live = hackathonPhase() === "live";

  const myBy = useMemo(() => new Map((mine?.items ?? []).map((i) => [i.projectId, i])), [mine]);
  const rows = useMemo(() => {
    const r = [...(board?.rows ?? [])];
    if (sort === "volume") r.sort((a, b) => b.volumeUsd - a.volumeUsd);
    else if (sort === "votes") r.sort((a, b) => b.votes - a.votes);
    else if (sort === "holders") r.sort((a, b) => b.holders - a.holders);
    else if (sort === "new") r.reverse();
    return r;
  }, [board, sort]);

  const pool = board?.poolUsd ?? 0;
  const next = board?.nextTier ?? null;

  return (
    <div>
      <p className="num text-[44px] font-extrabold leading-none text-foreground">{usd0(pool)}</p>
      <p className="mt-1 text-[15px] text-muted-foreground">{tr("Live prize pool")}{next ? ` · ${tr("next tier {amount}", { amount: usd0(next) })}` : ""}</p>
      {next && <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-up" style={{ width: `${Math.min(100, (pool / next) * 100)}%` }} /></div>}

      <div className="mt-6 flex gap-5 overflow-x-auto text-[15px] [scrollbar-width:none]">
        {SORTS.map((s) => (
          <button key={s.id} onClick={() => setSort(s.id)} className={`shrink-0 ${sort === s.id ? "font-bold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"}`}>{tr(s.label)}</button>
        ))}
      </div>

      {error && <p className="mt-6 text-sm text-muted-foreground">{tr("Could not load the leaderboard.")}</p>}
      {!board && !error && <div className="mt-6 h-40 animate-pulse rounded-2xl bg-muted/50" />}
      {board && rows.length === 0 && <p className="mt-6 text-[15px] text-muted-foreground">{tr("No project yet. Be the first to apply.")}</p>}

      <div className="mt-2">
        {rows.map((r) => {
          const my = myBy.get(r.projectId);
          const isOpen = open === r.projectId;
          return (
            <div key={r.projectId} className="py-1">
              <button onClick={() => setOpen(isOpen ? null : r.projectId)} className="flex w-full items-center gap-3.5 py-3 text-left">
                <span className="num w-7 shrink-0 text-[15px] text-muted-foreground">{r.rank}</span>
                {r.logoUrl ? <Image src={r.logoUrl} alt="" width={48} height={48} className="size-12 shrink-0 rounded-2xl object-cover" unoptimized />
                  : <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-sm font-bold text-muted-foreground">{r.name.slice(0, 2).toUpperCase()}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-semibold text-foreground">{r.name}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{r.prizeUsd ? tr("Prize {amount}", { amount: usd0(r.prizeUsd) }) : r.eligible ? tr("Eligible") : r.graduated ? tr("To watch: {reason}", { reason: tr(REASON[r.reasons[0]] ?? "check") }) : tr("Not graduated yet")}</span>
                </span>
                <span className="shrink-0 text-right"><b className="num block text-[16px] text-foreground">{r.score.toFixed(1)}</b><span className="text-[12px] text-muted-foreground">{tr("score")}</span></span>
              </button>
              {isOpen && (
                <div className="pb-4 pl-[42px]">
                  <div className="grid grid-cols-3 gap-4 pb-3">
                    <Stat label={tr("Volume")} value={`$${compact(r.volumeUsd)}`} />
                    <Stat label={tr("Holders")} value={compact(r.holders)} />
                    <Stat label={tr("Votes")} value={compact(r.votes)} />
                  </div>
                  <p className="text-[13px] text-muted-foreground">{tr(CATEGORY_LABEL[r.category] ?? r.category)}{r.ticker ? ` · $${r.ticker}` : ""}</p>
                  {my && <p className="mt-2 text-[14px] text-foreground">{tr("You invested {amount} · estimated gain {gain}", { amount: usd2(my.investedUsd), gain: usd2(my.estimatedGainUsd) })}</p>}
                  <div className="mt-3 flex gap-3">
                    <button disabled={!live} onClick={() => setVoting(r)} className="flex h-11 items-center justify-center rounded-2xl bg-foreground px-6 text-[15px] font-bold text-background disabled:opacity-40">
                      {my ? tr("Add votes") : tr("Vote")}
                    </button>
                    {r.mint && <a href={`/launchpad/${r.mint}`} className="flex h-11 items-center justify-center rounded-2xl bg-muted px-5 text-[15px] font-bold text-foreground hover:bg-muted/70">{tr("Token page")}</a>}
                  </div>
                  {!live && <p className="mt-2 text-[12px] text-muted-foreground">{tr("Votes open on {date}.", { date: HACKATHON.startsAt.slice(0, 10) })}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {voting && <VoteSheet row={voting} onClose={() => setVoting(null)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><p className="num text-[18px] font-bold text-foreground">{value}</p><p className="text-[12px] text-muted-foreground">{label}</p></div>;
}
