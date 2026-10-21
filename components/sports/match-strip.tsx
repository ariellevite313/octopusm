"use client";

import { useEffect, useState } from "react";
import { Badge, TeamLogo, type ScoreRow } from "./live-scores";

/** Score en direct du match lié à un pool (mis à jour toutes les 30 s tant que le match n'est pas terminé). */
export function MatchStrip({ matchKey, compact = false }: { matchKey: string; compact?: boolean }) {
  const [m, setM] = useState<ScoreRow | null>(null);

  useEffect(() => {
    let off = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await fetch(`/api/live-scores?key=${encodeURIComponent(matchKey)}`, { cache: "no-store" });
        const j = await r.json();
        if (off) return;
        setM(j.match ?? null);
        if (j.match && j.match.status !== "finished" && j.match.status !== "cancelled") timer = setTimeout(load, 30_000);
      } catch { if (!off) timer = setTimeout(load, 60_000); }
    };
    load();
    return () => { off = true; clearTimeout(timer); };
  }, [matchKey]);

  if (!m) return null;
  const has = m.score_home != null && m.score_away != null;
  const flag = m.league === "FIFA World Cup";
  const size = compact ? 20 : 26;
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-border ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <div className="w-10 shrink-0"><Badge m={m} /></div>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className={`truncate font-semibold text-foreground ${compact ? "text-[13px]" : "text-[15px]"}`}>{m.home}</span>
          <TeamLogo src={m.home_logo} name={m.home} size={size} flag={flag} />
        </span>
        <span className={`num shrink-0 px-1 font-bold ${m.status === "live" ? "text-foreground" : "text-muted-foreground"} ${compact ? "text-[15px]" : "text-[18px]"}`}>
          {has ? `${m.score_home} – ${m.score_away}` : "–"}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <TeamLogo src={m.away_logo} name={m.away} size={size} flag={flag} />
          <span className={`truncate font-semibold text-foreground ${compact ? "text-[13px]" : "text-[15px]"}`}>{m.away}</span>
        </span>
      </div>
    </div>
  );
}
