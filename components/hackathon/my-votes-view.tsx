"use client";

import Image from "next/image";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { useMyVotes, usd2 } from "./use-hackathon";

/** Mes votes : total, investi, gain estimé, puis un projet par ligne. Utilisé dans le hackathon et dans Mes tokens. */
export function MyVotesView() {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const { data, error } = useMyVotes();

  if (!isAuthenticated) {
    return <button onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} className="btn-primary flex h-12 items-center justify-center rounded-2xl px-6 text-[15px]">{tr("Connect Wallet")}</button>;
  }
  if (error) return <p className="py-6 text-sm text-muted-foreground">{tr("Could not load your votes.")}</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-muted/50" />;

  return (
    <section>
      <p className="num text-[44px] font-extrabold leading-none text-foreground">{Math.round(data.totalVotes)} {tr("votes")}</p>
      <p className="mt-1 text-[15px] text-muted-foreground">{tr("on {n} projects", { n: data.items.length })}</p>
      <div className="mt-4 flex gap-10">
        <div><p className="num text-xl font-bold text-foreground">{usd2(data.totalInvestedUsd)}</p><p className="text-[13px] text-muted-foreground">{tr("invested")}</p></div>
        <div><p className="num text-xl font-bold text-up">{usd2(data.estimatedGainUsd)}</p><p className="text-[13px] text-muted-foreground">{tr("estimated gain on Dec 25")}</p></div>
      </div>
      <div className="mt-4">
        {data.items.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">{tr("You have not voted yet. Buy the token of a project on OM to vote: $1 invested = 1 vote.")}</p>
        ) : data.items.map((i) => (
          <div key={i.projectId} className="flex items-center gap-3.5 py-3">
            {i.logoUrl ? <Image src={i.logoUrl} alt="" width={52} height={52} className="size-[52px] shrink-0 rounded-2xl object-cover" unoptimized />
              : <span className="flex size-[52px] shrink-0 items-center justify-center rounded-2xl bg-muted text-sm font-bold text-muted-foreground">{i.name.slice(0, 2).toUpperCase()}</span>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold text-foreground">{i.name}</p>
              <p className="truncate text-[13px] text-muted-foreground">{tr("{votes} votes · rank {rank}", { votes: Math.round(i.votes), rank: i.rank })}{i.inPrizeRange ? "" : ` · ${tr("outside the prizes")}`}</p>
            </div>
            <div className="shrink-0 text-right"><p className="num text-[16px] font-bold text-up">{usd2(i.estimatedGainUsd)}</p><p className="text-[12px] text-muted-foreground">{tr("estimated gain")}</p></div>
          </div>
        ))}
      </div>
      <Link href="/hackathon/classement" className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-foreground text-[15px] font-bold text-background">{tr("Add votes")}</Link>
    </section>
  );
}
