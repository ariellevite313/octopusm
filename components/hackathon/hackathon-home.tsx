"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HACKATHON, hackathonPhase } from "@/lib/hackathon/config";
import { TIERS } from "@/lib/hackathon/scoring";
import { useT } from "@/lib/i18n";
import { useBoard, usd0, CATEGORY_LABEL } from "./use-hackathon";
import { ProjectCard } from "./project-card";

/** Compteur qui monte de 0 jusqu'au montant maximum à l'arrivée sur la page. */
function useCountUp(target: number, ms = 1600) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const dateFmt = (iso: string, loc: string) => new Date(iso).toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function HackathonHome() {
  const { tr, lang } = useT();
  const loc = lang === "fr" ? "fr-FR" : "en-US";
  const amount = useCountUp(HACKATHON.maxPrizeUsdc);
  const phase = hackathonPhase();
  const { data: board } = useBoard();
  const [cat, setCat] = useState("all");

  const pool = board?.poolUsd ?? 0;
  // La barre va jusqu'à 100 000 ; les paliers bonus apparaissent quand la cagnotte s'en approche
  const top = pool >= 100_000 ? (board?.nextTier ?? TIERS[TIERS.length - 1]) : 100_000;
  const marks = [0, ...TIERS.filter((t) => t >= 25_000 && t <= top && (t <= 100_000 || t === top))];
  const cats = useMemo(() => ["all", "graduated", ...new Set((board?.rows ?? []).map((r) => r.category))], [board]);
  const rows = (board?.rows ?? []).filter((r) => cat === "all" || (cat === "graduated" ? r.graduated : r.category === cat));

  return (
    <div>
      <p className="text-[15px] text-muted-foreground">{HACKATHON.name} · {dateFmt(HACKATHON.startsAt, loc)} → {dateFmt(HACKATHON.endsAt, loc)}</p>
      <div className="mt-5 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[17px] text-muted-foreground">{tr("Up to")}</p>
          <p className="num text-[clamp(40px,10vw,84px)] font-extrabold leading-none tracking-tight text-foreground">{amount.toLocaleString("fr-FR").replace(/ /g, " ")} USDC</p>
          <p className="mt-4 max-w-xl text-[15px] text-muted-foreground">
            {phase === "soon" ? tr("Applications and votes open on {date}. Launch your token on OM and be ready.", { date: dateFmt(HACKATHON.startsAt, loc) })
              : phase === "live" ? tr("The hackathon is live. Apply, or back a project with your votes.")
              : tr("The hackathon is over. Prizes are paid on {date}.", { date: dateFmt(HACKATHON.payoutAt, loc) })}
          </p>
          <div className="mt-6 h-2 w-full max-w-2xl overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-up" style={{ width: `${Math.min(100, (pool / top) * 100)}%` }} /></div>
          <div className="mt-1.5 flex w-full max-w-2xl justify-between text-[12px] text-muted-foreground">{marks.map((m) => <span key={m}>{m === 0 ? "0" : usd0(m)}</span>)}</div>
          <p className="mt-3 text-[15px] text-muted-foreground"><b className="num text-[22px] text-foreground">{usd0(pool)}</b> {tr("collected so far")}</p>
        </div>
        <div className="flex w-full flex-col gap-3 lg:w-72">
          <Link href="/hackathon/candidater" className="flex h-12 items-center justify-center rounded-2xl bg-foreground text-[15px] font-bold text-background">{tr("Apply")}</Link>
          <Link href="/hackathon/classement" className="flex h-12 items-center justify-center rounded-2xl bg-muted text-[15px] font-bold text-foreground hover:bg-muted/70">{tr("Vote")}</Link>
          <Link href="/launchpad/create" className="flex h-12 items-center justify-center rounded-2xl bg-muted text-[15px] font-bold text-foreground hover:bg-muted/70">{tr("Launch my token on OM")}</Link>
        </div>
      </div>

      <p className="mt-12 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tr("Categories")}</p>
      <div className="mt-3 flex gap-5 overflow-x-auto text-[15px] [scrollbar-width:none]">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`shrink-0 ${cat === c ? "font-bold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"}`}>
            {c === "all" ? tr("All") : c === "graduated" ? tr("Graduated") : tr(CATEGORY_LABEL[c] ?? c)}
          </button>
        ))}
      </div>

      <p className="mt-9 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tr("Registered projects")}</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-[15px] text-muted-foreground">{board ? tr("No project yet. Be the first to apply.") : tr("Loading…")}</p>
      ) : (
        <div className="-mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">{rows.map((r) => <ProjectCard key={r.projectId} row={r} />)}</div>
      )}
      <Link href="/hackathon/classement" className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-muted px-6 text-[15px] font-bold text-foreground hover:bg-muted/70">{tr("See the full leaderboard")}</Link>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href={HACKATHON.discord} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-2xl bg-muted px-5 text-[14px] font-bold text-foreground hover:bg-muted/70">Discord</Link>
        <Link href={HACKATHON.telegram} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-2xl bg-muted px-5 text-[14px] font-bold text-foreground hover:bg-muted/70">Telegram</Link>
      </div>
    </div>
  );
}
