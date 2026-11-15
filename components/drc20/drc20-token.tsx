"use client";

/** Page d'un token DRC-20 : offre, progression du mint, plus gros holders et derniers mouvements. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ExternalLink, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { DOGE_EXPLORER, drcAmount, type Drc20Event, type Drc20Holder, type Drc20Token } from "@/lib/drc20";

const short = (a: string | null) => (a ? `${a.slice(0, 5)}…${a.slice(-4)}` : "-");

export function Drc20TokenView({ tick }: { tick: string }) {
  const { tr } = useT();
  const [d, setD] = useState<{ token: Drc20Token; holders: Drc20Holder[]; events: Drc20Event[] } | null | "none">(null);
  const [tab, setTab] = useState<"holders" | "activity">("holders");
  useEffect(() => { fetch(`/api/drc20/${encodeURIComponent(tick)}`).then((r) => (r.ok ? r.json() : null)).then((j) => setD(j?.token ? j : "none")).catch(() => setD("none")); }, [tick]);

  if (d === null) return <div className="flex justify-center py-24"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (d === "none") return (
    <main className="mx-auto max-w-2xl px-4 pt-10 text-center">
      <p className="text-[17px] font-bold text-foreground">{tr("Token not found")}</p>
      <Link href="/drc20" className="mt-4 inline-block rounded-full bg-foreground px-5 py-2.5 text-[14px] font-bold text-background">DRC-20</Link>
    </main>
  );
  const t = d.token;
  const kind: Record<string, string> = { deploy: tr("Deploy"), mint: tr("Mint"), inscribe_transfer: tr("Transfer ready"), transfer: tr("Transfer"), return: tr("Returned"), burn: tr("Burned") };
  const stats: [string, string][] = [
    [tr("Max supply"), drcAmount(t.max, t.dec)], [tr("Minted"), drcAmount(t.minted, t.dec)], [tr("Limit per mint"), drcAmount(t.lim, t.dec)],
    [tr("Holders"), t.holders.toLocaleString("en-US")], [tr("Decimals"), String(t.dec)], [tr("Deploy block"), t.height.toLocaleString("en-US")],
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
      <div className="flex items-center gap-3">
        <Link href="/drc20" aria-label={tr("Back")} className="flex size-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground"><ChevronLeft className="size-5" /></Link>
        <span className="flex size-12 items-center justify-center rounded-[16px] bg-muted text-[14px] font-bold uppercase text-foreground">{t.tick}</span>
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold uppercase leading-tight text-foreground">{t.tick}</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chains/dogecoin.png" alt="" className="size-4 rounded-full" />DRC-20 · Dogecoin
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-border p-4">
        <div className="flex items-end justify-between">
          <p className="text-sm text-muted-foreground">{tr("Mint progress")}</p>
          <p className="num text-[22px] font-bold text-foreground">{t.progress.toFixed(2)}%</p>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground" style={{ width: `${Math.min(100, t.progress)}%` }} /></div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="num mt-1 truncate text-[15px] font-bold text-foreground">{v}</p></div>
        ))}
      </div>

      <div className="mt-3 rounded-2xl bg-muted/40 p-3 text-[13px]">
        <p className="text-xs text-muted-foreground">{tr("Deployed by")}</p>
        <a href={`${DOGE_EXPLORER}/address/${t.deployer}`} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 break-all font-mono text-foreground">{t.deployer}<ExternalLink className="size-3.5 shrink-0" /></a>
      </div>

      <div className="mt-5 flex border-b border-border">
        {([["holders", tr("Holders")], ["activity", tr("Activity")]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 border-b-2 py-3 text-[15px] font-bold ${tab === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {tab === "holders" ? (
        d.holders.length ? (
          <ul className="divide-y divide-border">
            {d.holders.map((h, i) => (
              <li key={h.address} className="flex items-center gap-3 py-2.5">
                <span className="num w-7 shrink-0 text-[13px] font-semibold text-muted-foreground">{i + 1}</span>
                <a href={`${DOGE_EXPLORER}/address/${h.address}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-mono text-[14px] text-foreground">{short(h.address)}</a>
                <div className="text-right"><p className="num text-[14px] font-bold text-foreground">{drcAmount(h.amount, t.dec)}</p><p className="num text-[12px] text-muted-foreground">{h.pct.toFixed(2)}%</p></div>
              </li>
            ))}
          </ul>
        ) : <p className="py-8 text-center text-sm text-muted-foreground">{tr("No holders yet.")}</p>
      ) : d.events.length ? (
        <ul className="divide-y divide-border">
          {d.events.map((e, i) => (
            <li key={`${e.txid}${i}`} className="flex items-center gap-3 py-2.5 text-[14px]">
              <span className="w-24 shrink-0 font-semibold text-foreground">{kind[e.kind] ?? e.kind}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-muted-foreground">{e.kind === "transfer" ? `${short(e.from)} → ${short(e.to)}` : short(e.to ?? e.from)}</span>
              <a href={`${DOGE_EXPLORER}/transaction/${e.txid}`} target="_blank" rel="noopener noreferrer" className="num shrink-0 font-bold text-foreground">{e.kind === "deploy" ? "" : drcAmount(e.amt, t.dec)}</a>
            </li>
          ))}
        </ul>
      ) : <p className="py-8 text-center text-sm text-muted-foreground">{tr("No activity yet.")}</p>}
    </main>
  );
}
