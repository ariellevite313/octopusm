"use client";

/** Classement public : top 20 des parrains (gains versés), sur 30 jours ou depuis le début. Rafraîchi chaque minute. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import { Mirage } from "@/components/shared/mirage";

type Entry = { rank: number; wallet: string; name: string | null; avatar: string | null; usd: number; friends: number };

export function ReferralBoard() {
  const { tr } = useT();
  const [period, setPeriod] = useState<"30d" | "all">("30d");
  const [rows, setRows] = useState<Entry[] | null>(null);
  useEffect(() => {
    let off = false;
    const load = () => fetch(`/api/referrals/leaderboard?period=${period}`).then((r) => r.json()).then((j) => { if (!off) setRows(j.entries ?? []); }).catch(() => { if (!off) setRows([]); });
    setRows(null); load();
    const t = setInterval(load, 60_000);
    return () => { off = true; clearInterval(t); };
  }, [period]);

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <Trophy className="size-6" />
        <h1 className="text-[24px] font-bold tracking-tight">{tr("Top 20 referrers")}</h1>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
        {(["30d", "all"] as const).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={`rounded-xl py-2.5 text-sm font-bold ${period === p ? "bg-background text-foreground" : "text-muted-foreground"}`}>{p === "30d" ? tr("30 days") : tr("All time")}</button>
        ))}
      </div>
      <div className="rounded-3xl border border-border bg-card p-3">
        {rows === null ? <div className="flex justify-center py-10"><Mirage className="size-5 text-muted-foreground" /></div>
          : rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{tr("No referrer yet. Be the first.")}</p>
          : rows.map((e) => (
            <Link key={e.wallet} href={`/profile/${e.wallet}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-muted/50">
              <span className="num w-6 text-center text-[14px] font-bold text-muted-foreground">{e.rank}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {e.avatar ? <img src={e.avatar} alt="" className="size-10 rounded-full object-cover" /> : <span className="flex size-10 items-center justify-center rounded-full bg-muted font-bold">{(e.name ?? e.wallet).slice(0, 1).toUpperCase()}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{e.name ?? shortAddress(e.wallet)}</span>
                <span className="num block text-[12px] text-muted-foreground">{tr("{n} paying friends", { n: e.friends })}</span>
              </span>
              <span className="num text-[15px] font-extrabold">${e.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </Link>
          ))}
      </div>
    </div>
  );
}
