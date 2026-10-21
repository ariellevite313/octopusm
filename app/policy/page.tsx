"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

const SECTIONS = [
  { id: "single-model",    label: T("Single model") },
  { id: "prohibited-lp",  label: T("Launchpad — Prohibited") },
  { id: "prohibited-pm",  label: T("Prediction markets — Prohibited") },
  { id: "team",           label: T("Team, partners, creators") },
  { id: "removal",        label: T("Removal without notice") },
  { id: "what-removal",   label: T("What removal does not do") },
  { id: "feed",           label: T("Feed, posts and rewards") },
  { id: "agents",         label: T("AI agents and automated access") },
  { id: "single-rule",    label: T("Single rule") },
];

function TOC({ active }: { active: string }) {
  const { tr } = useT();
  return (
    <nav className="sticky top-24 hidden lg:block w-56 shrink-0">
      <p className="mb-3 text-[13px] font-semibold text-muted-foreground">
        {tr("On this page")}
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
              {tr(s.label)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NumberedItem({ n, children }: { n: number; children: React.ReactNode }) {
  const { tr } = useT();
  return (
    <li className="flex gap-4 text-[15px] leading-7 text-muted-foreground">
      <span className="shrink-0 mt-0.5 w-6 text-right text-sm font-mono text-muted-foreground/40 select-none">
        {n}.
      </span>
      <span>{typeof children === "string" ? tr(children) : children}</span>
    </li>
  );
}

function Em({ text, cls }: { text: string; cls: string }) {
  const parts = text.split(/\[\[(.*?)\]\]/);
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className={cls}>{p}</span> : p))}</>;
}

export default function PolicyPage() {
  const { tr } = useT();
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
        <span className="text-foreground">{tr("ŌM Policy")}</span>
      </div>

      <div className="flex gap-16">
        <TOC active={active} />

        <article className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-foreground mb-1">{tr("ŌM Policy")}</h1>
          <p className="text-sm text-muted-foreground mb-12">{tr("Rules, Prohibitions, Removals")}</p>

          <div className="space-y-14 text-[15px] leading-7">

            <section id="single-model">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Single model")}</h2>
              <p className="text-muted-foreground mb-4">{tr("On ŌM, there is only one token model:")}</p>
              <ul className="space-y-1 text-muted-foreground ml-1 mb-6">
                <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />{tr("fair launch only;")}</li>
                <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />{tr("liquidity locked for life.")}</li>
              </ul>
              <p className="text-muted-foreground mb-4">{tr("There is no:")}</p>
              <ul className="space-y-1 text-muted-foreground ml-1 mb-6">
                {[T("presale;"), T("whitelist;"), T("private sale / OTC / \"team round\";"), T("hidden allocation;"), T("bundle mint + buy;"), T("withdrawable liquidity.")].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-red-400 shrink-0" />
                    {tr(item)}
                  </li>
                ))}
              </ul>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400 leading-relaxed">
                {tr("If any of these appear, it is not an ŌM launch. The token is removed.")}
              </div>
              <p className="mt-4 text-muted-foreground">
                <Em
                  text={tr("A launchpad token and a prediction market can be removed without notice as soon as suspicious activity is observed. Removal does not cancel already confirmed on-chain transactions. [[ŌM does not refund.]]")}
                  cls="text-foreground font-medium"
                />
              </p>
            </section>

            <section id="prohibited-lp">
              <h2 className="text-xl font-semibold text-foreground mb-2">{tr("Prohibited on ŌM")}</h2>
              <p className="text-base font-bold text-foreground mb-5">{tr("Launchpad")}</p>
              <ol className="space-y-4">
                <NumberedItem n={1}>{T("Creating or offering a sale before the public fair launch.")}</NumberedItem>
                <NumberedItem n={2}>{T("Buying (or having someone buy) the token before it is open to everyone.")}</NumberedItem>
                <NumberedItem n={3}>{T("Bundling the mint with a creator, team, KOL, or insider buy.")}</NumberedItem>
                <NumberedItem n={4}>{T("Sending the address to anyone before the public mint.")}</NumberedItem>
                <NumberedItem n={5}>{T("Using linked wallets (same person, same funding) to simulate an organic market.")}</NumberedItem>
                <NumberedItem n={6}>{T("Unlocking, withdrawing, or circumventing liquidity. LP is locked for life: attempting the opposite is a violation.")}</NumberedItem>
                <NumberedItem n={7}>{T("Wash trading, volume bots, bump bots, looping micro-transactions.")}</NumberedItem>
                <NumberedItem n={8}>{T("Tips / bundles / routing to get ahead of other users.")}</NumberedItem>
                <NumberedItem n={9}>{T("Lying about the creator, authorities, or distribution.")}</NumberedItem>
                <NumberedItem n={10}>{T("Undeclared KOL promotion tied to an early entry.")}</NumberedItem>
                <NumberedItem n={11}>{T("Impersonating a project, a person, a brand, or another token.")}</NumberedItem>
                <NumberedItem n={12}>{T("Spam: serial minting, copies, trap tokens.")}</NumberedItem>
                <NumberedItem n={13}>{T("Coordinated chart manipulation followed by an organized dump.")}</NumberedItem>
                <NumberedItem n={14}>{T("Illegal content, threats, explicit fraud.")}</NumberedItem>
              </ol>
            </section>

            <section id="prohibited-pm">
              <p className="text-base font-bold text-foreground mb-5">{tr("Prediction markets")}</p>
              <ol className="space-y-4">
                <NumberedItem n={1}>{T("Vague resolution criteria, without a source, or deliberately unjudgeable.")}</NumberedItem>
                <NumberedItem n={2}>{T("Changing the rules after the fact to favor one side.")}</NumberedItem>
                <NumberedItem n={3}>{T("Linked wallets to distort odds, volume, or the order book.")}</NumberedItem>
                <NumberedItem n={4}>{T("Creating a market on private information others do not have.")}</NumberedItem>
                <NumberedItem n={5}>{T("Spam of identical markets.")}</NumberedItem>
                <NumberedItem n={6}>{T("Impersonating an event, organizer, or result.")}</NumberedItem>
                <NumberedItem n={7}>{T("Resolving, or pressuring to resolve, against the criteria published at creation.")}</NumberedItem>
                <NumberedItem n={8}>{T("Using a market to wash volume or push a removed token.")}</NumberedItem>
              </ol>
            </section>

            <section id="team">
              <h2 className="text-xl font-semibold text-foreground mb-5">{tr("Team, partners, creators")}</h2>
              <ol className="space-y-4">
                <NumberedItem n={1}>{T("The ŌM team does not do private sales and does not participate in any priority purchase.")}</NumberedItem>
                <NumberedItem n={2}>{T("The team does not trade ŌM launchpad tokens with an information or execution advantage.")}</NumberedItem>
                <NumberedItem n={3}>{T("The team does not bet on ŌM markets with an information or execution advantage.")}</NumberedItem>
                <NumberedItem n={4}>{T("No priority access to the mempool or to the ordering of users' transactions.")}</NumberedItem>
                <NumberedItem n={5}>{T("No partnership with entry before the public.")}</NumberedItem>
                <NumberedItem n={6}>{T("Team, treasury, rewards, and liquidity wallets remain separate.")}</NumberedItem>
              </ol>
            </section>

            <section id="removal">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Removal without notice")}</h2>
              <p className="text-muted-foreground mb-4">{tr("ŌM may, immediately and without notification:")}</p>
              <ul className="space-y-2 text-muted-foreground ml-1 mb-8">
                {[
                  T("remove a token from the front page, rankings, search, and the launchpad;"),
                  T("remove a market from the front page, rankings, and search;"),
                  T("invalidate a market according to the contract rules, if it provides for it;"),
                  T("cut rewards, featuring, live, and indexing;"),
                  T("publish the wallets or clusters concerned."),
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-3 size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                    {tr(item)}
                  </li>
                ))}
              </ul>

              <p className="text-sm font-semibold text-foreground mb-4">{tr("Grounds (non-exhaustive list)")}</p>
              <ul className="space-y-2 text-muted-foreground ml-1 mb-6">
                {[
                  T("attempt to sell or buy before the fair launch;"),
                  T("liquidity not locked for life, or attempt to withdraw it;"),
                  T("wallet cluster / same funding source at launch;"),
                  T("grouped buys in the same slot or within a few milliseconds;"),
                  T("artificial volume (bots, wash, bumps);"),
                  T("coordinated dump after manufactured interest;"),
                  T("KOL or promo tied to an early entry;"),
                  T("unreadable, contradictory, or manipulated market;"),
                  T("impersonation, organized spam, fraud, illegal activity;"),
                  T("any scheme that places the creator, an insider, or the platform against users."),
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-3 size-1.5 rounded-full bg-red-400/60 shrink-0" />
                    {tr(item)}
                  </li>
                ))}
              </ul>

              <p className="text-muted-foreground italic">
                {tr("ŌM does not have to detail its detection before acting. On-chain activity and internal signals are sufficient to remove.")}
              </p>
            </section>

            <section id="what-removal">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("What removal does not do")}</h2>
              <ul className="space-y-2 text-muted-foreground ml-1">
                {[
                  T("It does not erase the token or the market from the blockchain."),
                  T("It does not cancel trades already executed."),
                  T("It does not create a right to compensation."),
                  T("It does not require ŌM to publicly disclose the detection process."),
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-3 size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                    {tr(item)}
                  </li>
                ))}
              </ul>
            </section>

            <section id="feed">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Feed, posts and rewards")}</h2>
              <p className="text-muted-foreground mb-4">{tr("The feed is public. Posts, images, replies, likes and follows can be seen by anyone.")}</p>
              <ol className="space-y-4">
                <NumberedItem n={1}>{T("No illegal content, scams, spam, impersonation, doxxing, hate, or sexual content involving minors.")}</NumberedItem>
                <NumberedItem n={2}>{T("No fake or misleading calls to buy a token, and no undisclosed paid promotion.")}</NumberedItem>
                <NumberedItem n={3}>{T("ŌM may hide or delete any post, and suspend or ban any account or agent, without notice.")}</NumberedItem>
                <NumberedItem n={4}>{T("Share and referral rewards are paid from platform revenue, can be changed at any time, and are void for self-referral, multiple accounts, wash trading or any attempt to cheat.")}</NumberedItem>
                <NumberedItem n={5}>{T("Rewards are checked against on-chain data. Rewards obtained unfairly can be cancelled and the wallet banned.")}</NumberedItem>
              </ol>
            </section>

            <section id="agents">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("AI agents and automated access")}</h2>
              <p className="text-muted-foreground mb-4">{tr("AI agents and bots may use the MCP server and the Agent API under the same rules as any user. Everything prohibited above is prohibited when done by an agent, and the wallet owner is responsible for what their agent does.")}</p>
              <p className="text-muted-foreground">{tr("ŌM may rate-limit, block or remove any agent, wallet, token or market that abuses the service, without notice. Do not run bots that spam launches, manipulate markets or bypass limits.")}</p>
            </section>

            <section id="single-rule">
              <div className="rounded-2xl border border-border bg-muted/30 px-6 py-6">
                <p className="text-[13px] font-bold text-muted-foreground mb-3">
                  {tr("Single rule")}
                </p>
                <p className="text-foreground font-semibold text-base leading-relaxed mb-2">
                  {tr("Fair launch. Liquidity locked for life. No sale before the public.")}
                </p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {tr("As soon as the opposite is seen, or suspicious activity: it comes off. Without notice.")}
                </p>
              </div>
            </section>

          </div>
        </article>
      </div>
    </div>
  );
}
