"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";
import { HACKATHON } from "@/lib/hackathon/config";
import { RULES } from "@/lib/hackathon/rules";
import { prizeTable } from "@/lib/hackathon/scoring";

type Tab = "rules" | "pool" | "ranking" | "vote" | "bonus" | "apply";
const TABS: { id: Tab; label: string }[] = [
  { id: "rules", label: T("Rules") }, { id: "pool", label: T("Prize pool") }, { id: "ranking", label: T("Ranking") },
  { id: "vote", label: T("Vote") }, { id: "bonus", label: T("Bonus") }, { id: "apply", label: T("Apply") },
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mt-6"><h3 className="text-[17px] font-bold text-foreground">{title}</h3><div className="mt-1 space-y-1.5 text-[15px] leading-relaxed text-muted-foreground">{children}</div></div>;
}

export function InfosView() {
  const { tr } = useT();
  const [tab, setTab] = useState<Tab>("rules");
  const t100 = prizeTable(100_000);
  const usd = (n: number) => `${n.toLocaleString("fr-FR").replace(/ /g, " ")} $`;
  return (
    <div>
      <div className="flex gap-5 overflow-x-auto text-[15px] [scrollbar-width:none]">
        {TABS.map((x) => (
          <button key={x.id} onClick={() => setTab(x.id)} className={`shrink-0 ${tab === x.id ? "font-bold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"}`}>{tr(x.label)}</button>
        ))}
      </div>

      {tab === "rules" && (<>
        <Block title={tr("Dates")}><p>{tr("From November 24 to December 24, 2026. Prizes are paid on December 25, in USDC.")}</p></Block>
        <Block title={tr("Who can join")}><p>{tr("Anyone, with no limit on applications, until December 24. A team has 4 members at most. Only the top 50 projects are rewarded, with $500 at least each.")}</p></Block>
        <Block title={tr("Your token")}><p>{tr("Your token must already exist on OM before you apply, and it must graduate by December 24. It must also be healthy: enough holders, no heavy concentration, no bundle, a real price and some volume, and frozen team tokens left untouched.")}</p></Block>
        <Block title={tr("The team")}>
          <p>{tr("The team can hold {pct}% of the supply at most, and must freeze it for at least a year, checkable on-chain. Selling frozen tokens means exclusion and loss of the prize.", { pct: RULES.team.maxSupplyPct })}</p>
        </Block>
        <Block title={tr("Fair play")}><p>{tr("Fake volume, bundles, wallets linked to the team and organized sniping lead to exclusion. OM decides and the reason is shown on the page.")}</p></Block>
        <Block title={tr("Good to know")}><p>{tr("A token is not an investment and can lose all its value. OM can change the rules and publishes every change on this page.")}</p></Block>
      </>)}

      {tab === "pool" && (<>
        <Block title={tr("Prize pool")}><p>{tr("Up to {amount} USDC. The prize pool is paid from the trading fees of the hackathon tokens. The amount paid is the tier reached on December 24: the higher the volume, the higher the prizes.", { amount: "100 000" })}</p></Block>
        <Block title={tr("At 100 000 $")}>
          <p>{tr("1st: {a}", { a: usd(t100[0]) })}</p><p>{tr("2nd and 3rd: {a} each", { a: usd(t100[1]) })}</p>
          <p>{tr("4th to 10th: {a} each", { a: usd(t100[3]) })}</p><p>{tr("11th to 30th: {a} each", { a: usd(t100[10]) })}</p><p>{tr("31st to 50th: {a} each", { a: usd(t100[30]) })}</p>
        </Block>
        <Block title={tr("Lower and higher tiers")}><p>{tr("At 25 000 $, 50 projects get 500 $ each. At 10 000 $, 10 projects get 1 000 $ each. Below 10 000 $, 1 000 $ is paid per project while the pool lasts. Above 100 000 $ (250 000, 500 000, 1 000 000), the same table is scaled up.")}</p></Block>
        <Block title={tr("Voters")}><p>{tr("{pct}% of a winning project's prize goes to its voters, shared in proportion to their votes. The team keeps the rest.", { pct: RULES.voterShare * 100 })}</p></Block>
      </>)}

      {tab === "ranking" && (<>
        <Block title={tr("How the ranking works")}><p>{tr("Score = {h}% real holders, {v}% net volume, {o}% votes. Each one is measured against the best project. Only activity between November 24 and December 24 counts.", { h: RULES.weights.holders * 100, v: RULES.weights.volume * 100, o: RULES.weights.votes * 100 })}</p></Block>
        <Block title={tr("What is not counted")}><p>{tr("Team wallets do not count in volume or votes of their own token. Dust wallets are not real holders.")}</p></Block>
        <Block title={tr("Live")}><p>{tr("The leaderboard updates every few minutes and shows who is eligible.")}</p></Block>
      </>)}

      {tab === "vote" && (<>
        <Block title={tr("How to vote")}><p>{tr("$1 invested = 1 vote. You vote by buying the token of the project.")}</p></Block>
        <Block title={tr("What counts")}><p>{tr("Only purchases made on OM, from November 24 to December 24, give votes. Use the Vote button or the token page.")}</p></Block>
        <Block title={tr("What does not count")}><p>{tr("A purchase made elsewhere (Meteora, Jupiter, another app) gives no vote. A token received by transfer neither.")}</p></Block>
        <Block title={tr("If you sell")}><p>{tr("Your votes go down in the same proportion. Sell on OM: a sale made elsewhere is not seen, and your votes do not update.")}</p></Block>
        <Block title={tr("The rest")}><p>{tr("You can vote for several projects, $1 minimum per project, up to {cap} votes per wallet. The token price going up or down does not change your votes.", { cap: RULES.voteCapPerWallet })}</p></Block>
      </>)}

      {tab === "bonus" && (<>
        <Block title={tr("For winners")}><p>{tr("A verified Hackathon winner badge, a promotion on OM (home and feed), and a post from Omero.")}</p></Block>
        <Block title={tr("For voters")}><p>{tr("A voter badge, and a share of the prize of the projects you backed if they win.")}</p></Block>
        <Block title={tr("Community")}>
          <p><Link href={HACKATHON.discord} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground">Discord</Link> · <Link href={HACKATHON.telegram} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground">Telegram</Link></p>
        </Block>
      </>)}

      {tab === "apply" && (<>
        <Block title={tr("Before you apply")}><p>{tr("Launch your token on OM first. You need its contract address, a website that works over https, and your X profile. GitHub and a video are optional.")}</p></Block>
        <Block title={tr("Checks")}><p>{tr("OM checks on-chain that the token was launched on OM and that your connected wallet is its creator. You sign a message with your wallet to confirm.")}</p></Block>
        <div className="mt-6 flex gap-3">
          <Link href="/hackathon/candidater" className="flex h-12 items-center justify-center rounded-2xl bg-foreground px-6 text-[15px] font-bold text-background">{tr("Apply")}</Link>
          <Link href="/launchpad/create" className="flex h-12 items-center justify-center rounded-2xl bg-muted px-6 text-[15px] font-bold text-foreground hover:bg-muted/70">{tr("Launch my token on OM")}</Link>
        </div>
      </>)}
    </div>
  );
}
