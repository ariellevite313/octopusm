"use client";

/** Tableau de bord parrain : gains du jour / semaine / mois, estimation, liste des filleuls (volume et gains). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import { Mirage } from "@/components/shared/mirage";

type Friend = { wallet: string; name: string | null; avatar: string | null; joined: string | null; volume: number; earnedUsd: number; earnedClt: number };
type Data = { gains: { today: number; week: number; month: number; all: number }; estimate30: number; friends: number; active: number; list: Friend[] };

const usd = (n: number) => `$${n >= 1000 ? Math.round(n).toLocaleString("en-US") : n >= 1 ? n.toFixed(2) : n.toFixed(n > 0 ? 4 : 2)}`;

export function ReferralStats() {
  const { tr } = useT();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { fetch("/api/referrals/stats", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setErr(true)); }, []);
  if (err) return null;
  if (!d) return <div className="flex justify-center py-8"><Mirage className="size-5 text-muted-foreground" /></div>;

  const cells: [string, number][] = [[tr("Today"), d.gains.today], [tr("7 days"), d.gains.week], [tr("30 days"), d.gains.month], [tr("All time"), d.gains.all]];
  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-bold">{tr("My referral earnings")}</p>
          <Link href="/leaderboard/referrals" className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"><Trophy className="size-4" />{tr("Top 20")}</Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cells.map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-muted/50 px-3 py-2.5">
              <p className="num text-[20px] font-extrabold text-foreground">{usd(v)}</p>
              <p className="text-[12px] text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-3 py-2.5">
          <span className="text-[13px] text-muted-foreground">{tr("Next 30 days at the current pace")}</span>
          <span className="num text-[16px] font-extrabold text-foreground">≈ {usd(d.estimate30)}</span>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{tr("An estimate based on the last 7 and 30 days, not a promise.")}</p>
      </div>

      <div className="rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-bold">{tr("My referrals")}</p>
          <span className="num text-[13px] text-muted-foreground">{tr("{a} active of {n}", { a: d.active, n: d.friends })}</span>
        </div>
        {d.list.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{tr("No referral yet. Share your link to start earning.")}</p> : (
          <div className="mt-2">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{tr("Friend")}</span><span className="w-20 text-right">{tr("Volume")}</span><span className="w-20 text-right">{tr("Earned")}</span>
            </div>
            {d.list.map((f) => (
              <Link key={f.wallet} href={`/profile/${f.wallet}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl px-1 py-2 hover:bg-muted/50">
                <span className="flex min-w-0 items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {f.avatar ? <img src={f.avatar} alt="" className="size-8 shrink-0 rounded-full object-cover" /> : <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold">{(f.name ?? f.wallet).slice(0, 1).toUpperCase()}</span>}
                  <span className="truncate text-[14px] font-semibold">{f.name ?? shortAddress(f.wallet)}</span>
                </span>
                <span className="num w-20 text-right text-[13px] text-muted-foreground">{usd(f.volume)}</span>
                <span className="num w-20 text-right text-[13px] font-bold text-foreground">{usd(f.earnedUsd)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
