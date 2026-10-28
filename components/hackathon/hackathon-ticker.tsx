"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { Board, BoardRow } from "@/lib/hackathon/leaderboard";
import { topTwenty } from "@/lib/hackathon/ticker";
import { compact } from "./use-hackathon";

export function HackathonTicker() {
  const { tr } = useT();
  const [rows, setRows] = useState<BoardRow[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/hackathon/leaderboard").then((r) => (r.ok ? r.json() : null)).then((b: Board | null) => { if (alive && b) setRows(topTwenty(b.rows)); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (rows.length === 0) return null;
  const items = [...rows, ...rows];
  return (
    <div className="relative overflow-hidden py-2.5" aria-label={tr("Hackathon top 20")}>
      <div className="hackathon-marquee flex w-max items-center gap-7 px-4">
        {items.map((r, i) => (
          <Link key={`${r.projectId}-${i}`} href="/hackathon/classement" className="flex shrink-0 items-center gap-2.5">
            {r.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.logoUrl} alt="" className="size-8 rounded-lg object-cover" />
              : <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-[11px] font-bold text-muted-foreground">{r.name.slice(0, 2).toUpperCase()}</span>}
            <span className="text-[14px] font-semibold text-foreground">{r.name}</span>
            <span className="num text-[12px] text-muted-foreground">${compact(r.volumeUsd)} · {compact(r.votes)} {tr("votes")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
