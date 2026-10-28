"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n";
import { concentration } from "@/lib/holders-analysis";
import { HoldersBubbles } from "@/components/launchpad/holders-bubbles";

type Holder = { rank: number; owner: string; amount: number; pct: number; isProgram: boolean; name?: string | null; avatar?: string | null };

function fmtAmt(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
}

export function TokenHolders({ mint, chain = "solana", curve }: { mint: string; chain?: "solana" | "arc"; curve?: string }) {
  const { tr } = useT();
  const [rows, setRows] = useState<Holder[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState(false);
  const [partial, setPartial] = useState(false);
  const [view, setView] = useState<"list" | "bubbles">("list");
  const [bundle, setBundle] = useState<{ wallets: string[]; pct: number } | null>(null);

  // Achats groupés au lancement (Solana)
  useEffect(() => {
    if (chain !== "solana") return;
    let off = false;
    fetch(`/api/launchpad/bundle/${mint}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!off && d?.available && d.wallets?.length) setBundle({ wallets: d.wallets, pct: d.pct });
    }).catch(() => { /* badge facultatif */ });
    return () => { off = true; };
  }, [mint, chain]);

  useEffect(() => {
    let off = false;
    fetch(chain === "arc" ? `/api/launchpad/arc-holders/${mint}${curve ? `?curve=${curve}` : ""}` : `/api/launchpad/holders/${mint}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!off) { setRows(d.holders ?? []); setTotal(d.total ?? 0); setPartial(!!d.partial); } })
      .catch(() => { if (!off) setErr(true); });
    return () => { off = true; };
  }, [mint, chain, curve]);

  if (err) return <p className="py-8 text-center text-sm text-muted-foreground">{tr("Holders unavailable right now.")}</p>;
  if (!rows) return <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{tr("No holders yet.")}</p>;

  const conc = concentration(rows);
  const bundleSet = new Set(bundle?.wallets ?? []);

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <p className="text-[12px] text-muted-foreground">{tr("Top 10")}</p>
          <p className="num text-[16px] font-bold text-foreground">{conc.top10.toFixed(1)}%</p>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <p className="text-[12px] text-muted-foreground">{tr("Biggest holder")}</p>
          <p className="num text-[16px] font-bold text-foreground">{conc.biggest ? `${conc.biggest.pct.toFixed(1)}%` : "—"}</p>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <span>{tr("Excluding pool and programs")}</span>
        {bundle && (
          <span title={tr("Bought together in the first blocks")} className="rounded-md bg-down/15 px-1.5 py-0.5 font-semibold text-down">
            {tr("Bundle {pct}%", { pct: bundle.pct.toFixed(1) })}
          </span>
        )}
        <span className="ml-auto flex overflow-hidden rounded-lg border border-border text-[12px] font-semibold">
          {(["list", "bubbles"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 ${view === v ? "bg-foreground text-background" : "text-muted-foreground"}`}>
              {tr(v === "list" ? "List" : "Bubble map")}
            </button>
          ))}
        </span>
      </div>
      {partial && <p className="mb-2 text-[12px] text-muted-foreground">{tr("Top holders only (full list unavailable)")}</p>}
      {view === "bubbles" && <HoldersBubbles holders={rows} bundle={bundleSet} chain={chain} />}
      {view === "list" && (<>
      <p className="mb-2 text-[13px] text-muted-foreground">{total > 100 ? tr("Top 100 of {count} holders", { count: total }) : tr("{count} holders", { count: total })}</p>
      <div className="divide-y divide-border/60">
        {rows.map((h) => {
          const named = !!h.name;
          const cls = "flex items-center gap-3 py-2.5";
          const body = (
            <>
              <span className="num w-6 shrink-0 text-[13px] text-muted-foreground">{h.rank}</span>
              {named && (
                // eslint-disable-next-line @next/next/no-img-element
                h.avatar ? <img src={h.avatar} alt="" className="size-8 shrink-0 rounded-full object-cover" /> : <span className="size-8 shrink-0 rounded-full bg-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[14px] text-foreground">
                  {named ? (
                    <span className="truncate font-semibold">{h.name}</span>
                  ) : (
                    <>
                      <span className="font-mono">{h.owner.slice(0, 4)}…{h.owner.slice(-4)}</span>
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </>
                  )}
                  {bundleSet.has(h.owner) && (
                    <span className="rounded-md bg-down/15 px-1.5 py-0.5 text-[11px] font-semibold text-down">{tr("Bundle")}</span>
                  )}
                  {h.isProgram && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{tr("Pool / program")}</span>
                  )}
                </span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, h.pct)}%` }} />
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="num block text-[14px] font-semibold text-foreground">{h.pct.toFixed(2)}%</span>
                <span className="num block text-[12px] text-muted-foreground">{fmtAmt(h.amount)}</span>
              </span>
            </>
          );
          return named ? (
            <Link key={h.owner} href={`/profile/${h.owner}`} className={cls}>{body}</Link>
          ) : (
            <a key={h.owner} href={chain === "arc" ? `https://explorer.arc.io/address/${h.owner}` : `https://solscan.io/account/${h.owner}`} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>
          );
        })}
      </div>
      </>)}
    </div>
  );
}
