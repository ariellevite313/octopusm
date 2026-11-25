"use client";

/** Chronomètre du hackathon : d'abord la fin des inscriptions (15 décembre), puis la fin du concours (24 décembre). */
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { HACKATHON } from "@/lib/hackathon/config";

export function parts(ms: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

export function HackathonCountdown() {
  const { tr } = useT();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now == null) return <div className="h-[132px]" />;
  const close = Date.parse(HACKATHON.applicationsCloseAt), end = Date.parse(HACKATHON.endsAt);
  const regOpen = now <= close, live = now <= end;
  const label = regOpen ? tr("Applications close in") : live ? tr("Hackathon ends in") : tr("Hackathon ended");
  const p = parts((regOpen ? close : end) - now);
  const cells: [number, string][] = [[p.d, tr("days")], [p.h, tr("hours")], [p.m, tr("min")], [p.s, tr("sec")]];
  return (
    <section className="border-b border-border px-5 py-8 md:px-10">
      <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      {live && (
        <div className="mt-3 flex gap-3">
          {cells.map(([v, l]) => (
            <div key={l} className="min-w-[68px] rounded-2xl bg-muted px-3 py-3 text-center">
              <p className="num text-[32px] font-extrabold leading-none text-foreground">{String(v).padStart(2, "0")}</p>
              <p className="mt-1.5 text-[12px] text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[14px] text-muted-foreground">
        {regOpen ? tr("Apply before December 15. After that date, only registered projects compete.") : live ? tr("Applications are closed. Only registered projects compete.") : ""}
      </p>
    </section>
  );
}
