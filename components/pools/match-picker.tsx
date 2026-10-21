"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { TeamLogo, type ScoreRow } from "@/components/sports/live-scores";

/** Choix (facultatif) d'un match à lier au pool : le score s'affiche en direct et les paris se ferment au coup d'envoi. */
export function MatchPicker({ value, onPick }: { value: ScoreRow | null; onPick: (m: ScoreRow | null) => void }) {
  const { tr } = useT();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ScoreRow[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open || list) return;
    fetch("/api/live-scores?scope=upcoming", { cache: "no-store" }).then((r) => r.json()).then((j) => setList(j.matches ?? [])).catch(() => setList([]));
  }, [open, list]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list ?? []).filter((m) => !s || `${m.home} ${m.away} ${m.league ?? ""}`.toLowerCase().includes(s)).slice(0, 40);
  }, [list, q]);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-muted-foreground">{tr("Link a match (optional)")}</label>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
          <TeamLogo src={value.home_logo} name={value.home} size={22} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{value.home} – {value.away}</span>
          <TeamLogo src={value.away_logo} name={value.away} size={22} />
          <button type="button" onClick={() => onPick(null)} aria-label={tr("Remove")} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted/40">
          {tr("Choose a match")}
        </button>
      )}
      {open && !value && (
        <div className="rounded-xl border border-border">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search a team or league")} className="h-10 flex-1 bg-transparent text-sm focus:outline-none" />
          </div>
          <ul className="max-h-56 divide-y divide-border overflow-y-auto">
            {list === null && <li className="p-3 text-sm text-muted-foreground">…</li>}
            {list !== null && shown.length === 0 && <li className="p-3 text-sm text-muted-foreground">{tr("No upcoming match found.")}</li>}
            {shown.map((m) => (
              <li key={m.key}>
                <button type="button" onClick={() => { onPick(m); setOpen(false); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40">
                  <TeamLogo src={m.home_logo} name={m.home} size={20} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{m.home} – {m.away}</span>
                  <TeamLogo src={m.away_logo} name={m.away} size={20} />
                  <span className="num shrink-0 text-[11px] text-muted-foreground">{new Date(m.kickoff).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
