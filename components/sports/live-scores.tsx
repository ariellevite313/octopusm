"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";

export type ScoreRow = {
  key: string; league: string | null; league_logo: string | null;
  home: string; home_logo: string | null; away: string; away_logo: string | null;
  score_home: number | null; score_away: number | null;
  status: "scheduled" | "live" | "halftime" | "finished" | "postponed" | "cancelled"; minute: number | null; kickoff: string;
};
type M = ScoreRow;

/** Logo d'équipe dans le style de la plateforme : pastille ronde, logo centré ; initiales si le logo manque. */
export function TeamLogo({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border" style={{ width: size, height: size }}>
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="object-contain" style={{ width: size * 0.72, height: size * 0.72 }} />
      ) : (
        <span className="font-bold text-foreground" style={{ fontSize: size * 0.36 }}>{initials}</span>
      )}
    </span>
  );
}

function Badge({ m }: { m: M }) {
  const { tr } = useT();
  if (m.status === "live") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-bold text-down">
        <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-down opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-down" /></span>
        {m.minute != null ? `${m.minute}'` : tr("Live")}
      </span>
    );
  }
  if (m.status === "halftime") return <span className="text-xs font-bold text-primary">{tr("HT")}</span>;
  if (m.status === "finished") return <span className="text-xs font-semibold text-muted-foreground">{tr("FT")}</span>;
  if (m.status === "postponed") return <span className="text-xs font-semibold text-muted-foreground">{tr("Postponed")}</span>;
  if (m.status === "cancelled") return <span className="text-xs font-semibold text-muted-foreground">{tr("Cancelled")}</span>;
  return <span className="num text-xs font-semibold text-muted-foreground">{new Date(m.kickoff).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</span>;
}

export function LiveScores({ initial = [] as M[], poll = true }: { initial?: M[]; poll?: boolean }) {
  const { tr } = useT();
  const [list, setList] = useState<M[]>(initial);
  const [loading, setLoading] = useState(initial.length === 0 && poll);

  useEffect(() => {
    if (!poll) return;
    let off = false;
    const load = () => fetch("/api/live-scores?scope=today", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (!off) { setList(j.matches ?? []); setLoading(false); } }).catch(() => !off && setLoading(false));
    load();
    const t = setInterval(load, 30_000);
    return () => { off = true; clearInterval(t); };
  }, [poll]);

  const groups = useMemo(() => {
    const rank = (m: M) => (m.status === "live" || m.status === "halftime" ? 0 : m.status === "scheduled" ? 1 : 2);
    const sorted = [...list].sort((a, b) => rank(a) - rank(b) || a.kickoff.localeCompare(b.kickoff));
    const g = new Map<string, { logo: string | null; items: M[] }>();
    for (const m of sorted) {
      const k = m.league ?? tr("Other");
      if (!g.has(k)) g.set(k, { logo: m.league_logo, items: [] });
      g.get(k)!.items.push(m);
    }
    return [...g.entries()];
  }, [list, tr]);

  const liveCount = list.filter((m) => m.status === "live" || m.status === "halftime").length;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{tr("Live scores")}</h1>
        {liveCount > 0 && <span className="text-sm font-semibold text-down">{tr("{n} live", { n: liveCount })}</span>}
      </div>
      {loading ? (
        <div className="mt-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted/30" />)}</div>
      ) : groups.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{tr("No matches today.")}</p>
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map(([league, g]) => (
            <section key={league}>
              <div className="mb-2 flex items-center gap-2">
                {g.logo && <TeamLogo src={g.logo} name={league} size={22} />}
                <h2 className="text-sm font-bold text-muted-foreground">{league}</h2>
              </div>
              <ul className="divide-y divide-border">
                {g.items.map((m) => {
                  const hasScore = m.score_home != null && m.score_away != null;
                  return (
                    <li key={m.key} className="flex items-center gap-3 py-3">
                      <div className="w-12 shrink-0"><Badge m={m} /></div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2"><TeamLogo src={m.home_logo} name={m.home} /><span className="truncate text-[15px] font-semibold text-foreground">{m.home}</span></div>
                        <div className="flex items-center gap-2"><TeamLogo src={m.away_logo} name={m.away} /><span className="truncate text-[15px] font-semibold text-foreground">{m.away}</span></div>
                      </div>
                      <div className={`num w-8 shrink-0 space-y-2 text-right text-[17px] font-bold ${m.status === "live" ? "text-foreground" : "text-muted-foreground"}`}>
                        <p className="leading-7">{hasScore ? m.score_home : "–"}</p>
                        <p className="leading-7">{hasScore ? m.score_away : "–"}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
