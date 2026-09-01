"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SECTIONS = [
  { id: "single-model",    label: "Single model" },
  { id: "prohibited-lp",  label: "Launchpad — Prohibited" },
  { id: "prohibited-pm",  label: "Prediction markets — Prohibited" },
  { id: "team",           label: "Team, partners, creators" },
  { id: "removal",        label: "Removal without notice" },
  { id: "what-removal",   label: "What removal does not do" },
  { id: "single-rule",    label: "Single rule" },
];

function TOC({ active }: { active: string }) {
  return (
    <nav className="sticky top-24 hidden lg:block w-56 shrink-0">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
        On this page
      </p>
      <ul className="space-y-1">
        {SECTIONS.map(s => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={`block py-1 text-[13px] transition-colors leading-snug ${
                active === s.id
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NumberedItem({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 text-[15px] leading-7 text-muted-foreground">
      <span className="shrink-0 mt-0.5 w-6 text-right text-sm font-mono text-muted-foreground/40 select-none">
        {n}.
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function PolicyPage() {
  const [active, setActive] = useState("single-model");

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">

      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">OMdotfun</Link>
        <span>/</span>
        <span className="text-foreground">ŌM Policy</span>
      </div>

      <div className="flex gap-16">
        <TOC active={active} />

        <article className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-foreground mb-1">ŌM Policy</h1>
          <p className="text-sm text-muted-foreground mb-12">Rules, Prohibitions, Removals</p>

          <div className="space-y-14 text-[15px] leading-7">

            <section id="single-model">
              <h2 className="text-xl font-semibold text-foreground mb-4">Single model</h2>
              <p className="text-muted-foreground mb-4">On ŌM, there is only one token model:</p>
              <ul className="space-y-1 text-muted-foreground ml-1 mb-6">
                <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />fair launch only;</li>
                <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />liquidity locked for life.</li>
              </ul>
              <p className="text-muted-foreground mb-4">There is no:</p>
              <ul className="space-y-1 text-muted-foreground ml-1 mb-6">
                {["presale;", "whitelist;", "private sale / OTC / \"team round\";", "hidden allocation;", "bundle mint + buy;", "withdrawable liquidity."].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-red-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400 leading-relaxed">
                If any of these appear, it is not an ŌM launch. The token is removed.
              </div>
              <p className="mt-4 text-muted-foreground">
                A launchpad token and a prediction market can be removed without notice as soon as
                suspicious activity is observed. Removal does not cancel already confirmed on-chain
                transactions. <span className="text-foreground font-medium">ŌM does not refund.</span>
              </p>
            </section>

            <section id="prohibited-lp">
              <h2 className="text-xl font-semibold text-foreground mb-2">Prohibited on ŌM</h2>
              <p className="text-sm font-medium text-muted-foreground/60 uppercase tracking-widest mb-5">Launchpad</p>
              <ol className="space-y-4">
                <NumberedItem n={1}>Creating or offering a sale before the public fair launch.</NumberedItem>
                <NumberedItem n={2}>Buying (or having someone buy) the token before it is open to everyone.</NumberedItem>
                <NumberedItem n={3}>Bundling the mint with a creator, team, KOL, or insider buy.</NumberedItem>
                <NumberedItem n={4}>Sending the address to anyone before the public mint.</NumberedItem>
                <NumberedItem n={5}>Using linked wallets (same person, same funding) to simulate an organic market.</NumberedItem>
                <NumberedItem n={6}>
                  Unlocking, withdrawing, or circumventing liquidity. LP is locked for life: attempting
                  the opposite is a violation.
                </NumberedItem>
                <NumberedItem n={7}>Wash trading, volume bots, bump bots, looping micro-transactions.</NumberedItem>
                <NumberedItem n={8}>Tips / bundles / routing to get ahead of other users.</NumberedItem>
                <NumberedItem n={9}>Lying about the creator, authorities, or distribution.</NumberedItem>
                <NumberedItem n={10}>Undeclared KOL promotion tied to an early entry.</NumberedItem>
                <NumberedItem n={11}>Impersonating a project, a person, a brand, or another token.</NumberedItem>
                <NumberedItem n={12}>Spam: serial minting, copies, trap tokens.</NumberedItem>
                <NumberedItem n={13}>Coordinated chart manipulation followed by an organized dump.</NumberedItem>
                <NumberedItem n={14}>Illegal content, threats, explicit fraud.</NumberedItem>
              </ol>
            </section>

            <section id="prohibited-pm">
              <p className="text-sm font-medium text-muted-foreground/60 uppercase tracking-widest mb-5">Prediction markets</p>
              <ol className="space-y-4">
                <NumberedItem n={1}>Vague resolution criteria, without a source, or deliberately unjudgeable.</NumberedItem>
                <NumberedItem n={2}>Changing the rules after the fact to favor one side.</NumberedItem>
                <NumberedItem n={3}>Linked wallets to distort odds, volume, or the order book.</NumberedItem>
                <NumberedItem n={4}>Creating a market on private information others do not have.</NumberedItem>
                <NumberedItem n={5}>Spam of identical markets.</NumberedItem>
                <NumberedItem n={6}>Impersonating an event, organizer, or result.</NumberedItem>
                <NumberedItem n={7}>Resolving, or pressuring to resolve, against the criteria published at creation.</NumberedItem>
                <NumberedItem n={8}>Using a market to wash volume or push a removed token.</NumberedItem>
              </ol>
            </section>

            <section id="team">
              <h2 className="text-xl font-semibold text-foreground mb-5">Team, partners, creators</h2>
              <ol className="space-y-4">
                <NumberedItem n={1}>The ŌM team does not do private sales and does not participate in any priority purchase.</NumberedItem>
                <NumberedItem n={2}>The team does not trade ŌM launchpad tokens with an information or execution advantage.</NumberedItem>
                <NumberedItem n={3}>The team does not bet on ŌM markets with an information or execution advantage.</NumberedItem>
                <NumberedItem n={4}>No priority access to the mempool or to the ordering of users&apos; transactions.</NumberedItem>
                <NumberedItem n={5}>No partnership with entry before the public.</NumberedItem>
                <NumberedItem n={6}>Team, treasury, rewards, and liquidity wallets remain separate.</NumberedItem>
              </ol>
            </section>

            <section id="removal">
              <h2 className="text-xl font-semibold text-foreground mb-4">Removal without notice</h2>
              <p className="text-muted-foreground mb-4">ŌM may, immediately and without notification:</p>
              <ul className="space-y-2 text-muted-foreground ml-1 mb-8">
                {[
                  "remove a token from the front page, rankings, search, and the launchpad;",
                  "remove a market from the front page, rankings, and search;",
                  "invalidate a market according to the contract rules, if it provides for it;",
                  "cut rewards, featuring, live, and indexing;",
                  "publish the wallets or clusters concerned.",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-3 size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              <p className="text-sm font-semibold text-foreground mb-4">Grounds (non-exhaustive list)</p>
              <ul className="space-y-2 text-muted-foreground ml-1 mb-6">
                {[
                  "attempt to sell or buy before the fair launch;",
                  "liquidity not locked for life, or attempt to withdraw it;",
                  "wallet cluster / same funding source at launch;",
                  "grouped buys in the same slot or within a few milliseconds;",
                  "artificial volume (bots, wash, bumps);",
                  "coordinated dump after manufactured interest;",
                  "KOL or promo tied to an early entry;",
                  "unreadable, contradictory, or manipulated market;",
                  "impersonation, organized spam, fraud, illegal activity;",
                  "any scheme that places the creator, an insider, or the platform against users.",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-3 size-1.5 rounded-full bg-red-400/60 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              <p className="text-muted-foreground italic">
                ŌM does not have to detail its detection before acting. On-chain activity and internal
                signals are sufficient to remove.
              </p>
            </section>

            <section id="what-removal">
              <h2 className="text-xl font-semibold text-foreground mb-4">What removal does not do</h2>
              <ul className="space-y-2 text-muted-foreground ml-1">
                {[
                  "It does not erase the token or the market from the blockchain.",
                  "It does not cancel trades already executed.",
                  "It does not create a right to compensation.",
                  "It does not require ŌM to publicly disclose the detection process.",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-3 size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section id="single-rule">
              <div className="rounded-2xl border border-border bg-muted/30 px-6 py-6">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
                  Single rule
                </p>
                <p className="text-foreground font-semibold text-base leading-relaxed mb-2">
                  Fair launch. Liquidity locked for life. No sale before the public.
                </p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  As soon as the opposite is seen, or suspicious activity: it comes off. Without notice.
                </p>
              </div>
            </section>

          </div>
        </article>
      </div>
    </div>
  );
}
