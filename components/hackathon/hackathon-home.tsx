"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HACKATHON, hackathonPhase } from "@/lib/hackathon/config";
import { useT } from "@/lib/i18n";

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

const dateFmt = (iso: string, lang: string) =>
  new Date(iso).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function HackathonHome() {
  const { tr, lang } = useT();
  const amount = useCountUp(HACKATHON.maxPrizeUsdc);
  const phase = hackathonPhase();
  const loc = lang === "fr" ? "fr-FR" : "en-US";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="text-[15px] text-muted-foreground">
        {HACKATHON.name} · {dateFmt(HACKATHON.startsAt, loc)} → {dateFmt(HACKATHON.endsAt, loc)}
      </p>
      <p className="mt-6 text-[17px] text-muted-foreground">{tr("Up to")}</p>
      <p className="num text-[clamp(44px,12vw,92px)] font-extrabold leading-none tracking-tight text-foreground">
        {amount.toLocaleString("fr-FR").replace(/ /g, " ")} USDC
      </p>
      <p className="mt-4 max-w-xl text-[16px] text-muted-foreground">
        {phase === "soon"
          ? tr("Applications and votes open on {date}. Launch your token on OM and be ready.", { date: dateFmt(HACKATHON.startsAt, loc) })
          : phase === "live"
            ? tr("The hackathon is live.")
            : tr("The hackathon is over. Prizes are paid on {date}.", { date: dateFmt(HACKATHON.payoutAt, loc) })}
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/launchpad/create" className="btn-primary flex h-12 items-center justify-center rounded-2xl px-6 text-[15px] font-bold">
          {tr("Launch my token on OM")}
        </Link>
        <Link href={HACKATHON.discord} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center rounded-2xl bg-muted px-6 text-[15px] font-bold text-foreground hover:bg-muted/70">
          Discord
        </Link>
        <Link href={HACKATHON.telegram} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center rounded-2xl bg-muted px-6 text-[15px] font-bold text-foreground hover:bg-muted/70">
          Telegram
        </Link>
      </div>
    </div>
  );
}
