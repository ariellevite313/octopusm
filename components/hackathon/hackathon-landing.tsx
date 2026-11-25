"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useT, Tr } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";
import { HACKATHON, MAX_TEAM } from "@/lib/hackathon/config";
import { RULES } from "@/lib/hackathon/rules";
import { prizeTable } from "@/lib/hackathon/scoring";
import { HackathonCountdown } from "@/components/hackathon/hackathon-countdown";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{children}</p>;
}

/** Page d'accueil du hackathon : mise en page inspirée de la série Build X d'OKX, avec le style et les règles d'OM. */
export function HackathonLanding() {
  const { tr } = useT();
  const t = prizeTable(100_000);
  const [open, setOpen] = useState<number | null>(0);
  const faq = [
    [T("Who can join?"), T("Anyone. Applications stay open until December 15. After that, only registered projects compete. A team has {n} members at most.")],
    [T("Does my token need to be on OM?"), T("Yes. Launch it on OM before you apply. It must graduate by December 24 and stay healthy: real holders, no heavy concentration, no bundles.")],
    [T("How are prizes paid?"), T("In USDC on December 25. The prize pool comes from the trading fees of the hackathon tokens, so it grows with your volume.")],
    [T("What can get a project excluded?"), T("Fake volume, bundles, wallets linked to the team and organized sniping. OM decides and shows the reason on the page.")],
  ] as const;

  return (
    <div className="-mx-4 -mt-6 overflow-hidden">
      {/* Hero */}
      <section className="relative px-5 pb-14 pt-12 md:px-10 md:pb-24 md:pt-20">
        {/* Champ de points animé : la grille dérive doucement et une vague de lumière la traverse */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-full [mask-image:radial-gradient(ellipse_70%_45%_at_90%_8%,#000_0%,transparent_100%)] md:w-3/5 md:[mask-image:linear-gradient(115deg,transparent_18%,#000_55%,transparent_92%)]">
          <div className="om-dots absolute inset-0 opacity-50 md:opacity-60"
            style={{ backgroundImage: "radial-gradient(circle, currentColor 1.1px, transparent 1.6px)", backgroundSize: "9px 9px", color: "var(--muted-foreground)" }} />
          <div className="om-dots-wave absolute inset-0"
            style={{ backgroundImage: "radial-gradient(circle, currentColor 1.5px, transparent 2.1px)", backgroundSize: "9px 9px", color: "var(--foreground)" }} />
        </div>
        <div aria-hidden className="pointer-events-none absolute -right-24 top-6 size-[420px] rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--foreground) 35%, transparent), transparent 65%)" }} />
        <div className="relative max-w-3xl">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-foreground"><span className="size-2 rounded-full bg-up" />{HACKATHON.name}</p>
          <h1 className="mt-5 text-[clamp(44px,11vw,108px)] font-extrabold leading-[0.95] tracking-tight text-foreground">
            Build<br />on OM<br /><span className="text-muted-foreground"><Tr>Hackathon</Tr></span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
            {tr("Launch your token on OM, grow a real community and climb the leaderboard. Up to {amount} USDC to win.", { amount: HACKATHON.maxPrizeUsdc.toLocaleString("en-US") })}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/hackathon/candidater" className="flex h-12 items-center justify-center rounded-2xl bg-foreground px-8 text-[15px] font-bold text-background">{tr("Apply now")}</Link>
            <Link href="/hackathon/classement" className="flex h-12 items-center justify-center rounded-2xl border border-border px-8 text-[15px] font-bold text-foreground hover:bg-muted">{tr("See the leaderboard")}</Link>
            <Link href="/hackathon/projets" className="flex h-12 items-center justify-center rounded-2xl px-6 text-[15px] font-bold text-muted-foreground hover:text-foreground">{tr("Registered projects")}</Link>
          </div>
        </div>
      </section>

      {/* Chiffres clés */}
      <HackathonCountdown />

      <section className="grid grid-cols-2 border-b border-border md:grid-cols-4">
        {[
          [`${HACKATHON.maxPrizeUsdc.toLocaleString("en-US")}`, T("USDC prize pool")],
          ["50", T("rewarded projects")],
          [`${day(HACKATHON.startsAt).replace(/, 2026/, "")} to ${day(HACKATHON.endsAt).replace(/, 2026/, "")}`, T("Hackathon dates")],
          [`${MAX_TEAM}`, T("members per team, max")],
        ].map(([v, l], i) => (
          <div key={l} className={`px-5 py-7 md:px-10 ${i % 2 === 1 ? "border-l border-border" : ""} ${i > 1 ? "border-t border-border md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}>
            <p className="num text-[clamp(22px,4vw,36px)] font-extrabold leading-tight text-foreground">{v}</p>
            <p className="mt-1 text-[14px] text-muted-foreground">{tr(l)}</p>
          </div>
        ))}
      </section>

      {/* Trouve le prochain gros token */}
      <section className="px-5 py-14 md:px-10 md:py-20">
        <Eyebrow>{tr("The idea")}</Eyebrow>
        <h2 className="mt-3 max-w-3xl text-[clamp(30px,6vw,56px)] font-extrabold leading-[1.05] tracking-tight text-foreground">{tr("Real tokens. Real holders. Real volume.")}</h2>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
          {tr("The best projects are chosen by what happens on chain, not by a jury. Trade, hold and vote: the leaderboard updates every few minutes.")}
        </p>
      </section>

      {/* Cagnotte */}
      <section className="border-t border-border px-5 py-14 md:px-10 md:py-20">
        <Eyebrow>{tr("Prize pool")}</Eyebrow>
        <p className="num mt-3 text-[clamp(40px,9vw,88px)] font-extrabold leading-none tracking-tight text-foreground">{usd(HACKATHON.maxPrizeUsdc)} <span className="text-muted-foreground">USDC</span></p>
        <div className="mt-8 grid gap-3 md:grid-cols-5">
          {([["1st", t[0], 1], ["2nd and 3rd", t[1], 2], ["4th to 10th", t[3], 7], ["11th to 30th", t[10], 20], ["31st to 50th", t[30], 20]] as const).map(([r, v, n]) => (
            <div key={r} className="rounded-2xl bg-muted p-5">
              <p className="text-[14px] font-semibold text-muted-foreground">{tr(r)}</p>
              <p className="num mt-2 text-[26px] font-extrabold text-foreground">{usd(v)}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{n === 1 ? tr("1 winner") : tr("{n} winners, each", { n })}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[14px] text-muted-foreground">{tr("{pct}% of a winning project's prize goes to its voters.", { pct: RULES.voterShare * 100 })}</p>
      </section>

      {/* Critères */}
      <section className="border-t border-border px-5 py-14 md:px-10 md:py-20">
        <Eyebrow>{tr("How you are ranked")}</Eyebrow>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {([[RULES.weights.volume, T("Net volume"), T("Trading volume of your token, without your own team wallets.")], [RULES.weights.votes, T("Votes"), T("Your community backs your project with votes, capped per wallet.")], [RULES.weights.holders, T("Real holders"), T("Wallets that really hold your token. Dust wallets do not count.")]] as const).map(([w, h, d]) => (
            <div key={h} className="rounded-2xl border border-border p-6">
              <p className="num text-[56px] font-extrabold leading-none text-foreground">{Math.round(w * 100)}<span className="text-[28px] text-muted-foreground">%</span></p>
              <p className="mt-4 text-[18px] font-bold text-foreground">{tr(h)}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{tr(d)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Calendrier */}
      <section className="border-t border-border px-5 py-14 md:px-10 md:py-20">
        <Eyebrow>{tr("Timeline")}</Eyebrow>
        <ol className="mt-6 grid gap-6 md:grid-cols-4">
          {([[day(HACKATHON.startsAt), T("Hackathon starts"), T("Rankings and votes begin. Early applications are already listed.")], ["Nov 24 to Dec 24", T("Build and grow"), T("Launch, trade, hold, vote. The leaderboard is live.")], [day(HACKATHON.endsAt), T("Final snapshot"), T("Your token must have graduated and be healthy.")], [day(HACKATHON.payoutAt), T("Prizes paid"), T("In USDC, to the winning teams and their voters.")]] as const).map(([d, h, p], i) => (
            <li key={h} className="border-l-2 border-border pl-5">
              <p className="num text-[13px] font-bold text-muted-foreground">{String(i + 1).padStart(2, "0")}</p>
              <p className="mt-1 text-[15px] font-semibold text-foreground">{d}</p>
              <p className="mt-2 text-[17px] font-bold text-foreground">{tr(h)}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{tr(p)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Comment participer */}
      <section className="border-t border-border px-5 py-14 md:px-10 md:py-20">
        <Eyebrow>{tr("How to join")}</Eyebrow>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {([T("Launch your token on OM"), T("Apply with your team"), T("Grow holders and volume"), T("Graduate before December 24")] as const).map((s, i) => (
            <div key={s} className="rounded-2xl bg-muted p-6">
              <p className="num text-[34px] font-extrabold text-muted-foreground">{i + 1}</p>
              <p className="mt-6 text-[17px] font-bold leading-snug text-foreground">{tr(s)}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/hackathon/candidater" className="flex h-12 items-center justify-center rounded-2xl bg-foreground px-8 text-[15px] font-bold text-background">{tr("Apply now")}</Link>
          <Link href="/launchpad/create" className="flex h-12 items-center justify-center rounded-2xl border border-border px-8 text-[15px] font-bold text-foreground hover:bg-muted">{tr("Launch my token on OM")}</Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border px-5 py-14 md:px-10 md:py-20">
        <Eyebrow>FAQ</Eyebrow>
        <div className="mt-4 max-w-3xl divide-y divide-border">
          {faq.map(([q, a], i) => (
            <div key={q}>
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 py-5 text-left text-[17px] font-bold text-foreground">
                {tr(q)}<ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && <p className="pb-5 text-[15px] leading-relaxed text-muted-foreground">{tr(a, { n: MAX_TEAM })}</p>}
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={HACKATHON.discord} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center rounded-2xl bg-muted px-5 text-[14px] font-bold text-foreground hover:bg-muted/70">Discord</Link>
          <Link href={HACKATHON.telegram} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center rounded-2xl bg-muted px-5 text-[14px] font-bold text-foreground hover:bg-muted/70">Telegram</Link>
        </div>
        <p className="mt-6 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">{tr("A token is not an investment and can lose all its value. OM can change the rules and publishes every change on this page.")}</p>
      </section>
    </div>
  );
}
