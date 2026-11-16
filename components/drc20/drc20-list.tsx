"use client";

/** Liste des tokens DRC-20 (Dogecoin) indexés par OM : détenteurs, progression du mint, recherche. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { drcAmount, type Drc20Token } from "@/lib/drc20";

export function Drc20List() {
  const { tr } = useT();
  const [sort, setSort] = useState<"holders" | "new" | "progress">("holders");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ tokens: Drc20Token[]; indexed: number | null } | null>(null);
  // Classement numéroté : Top 100 par nombre de détenteurs, hors recherche
  const ranked = sort === "holders" && !q.trim();

  useEffect(() => {
    let off = false;
    setData(null);
    const t = setTimeout(() => {
      fetch(`/api/drc20?sort=${sort}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`).then((r) => r.json()).then((j) => { if (!off) setData(j); }).catch(() => { if (!off) setData({ tokens: [], indexed: null }); });
    }, q ? 300 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [sort, q]);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
      <div className="flex items-center gap-3">
        <Link href="/terminal" aria-label={tr("Back")} className="flex size-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground"><ChevronLeft className="size-5" /></Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chains/dogecoin.png" alt="" className="size-9 rounded-full" />
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight text-foreground">DRC-20</h1>
          <p className="text-xs text-muted-foreground">{tr("Dogecoin tokens, indexed by OMdotfun")}{data?.indexed ? ` · ${tr("block")} ${data.indexed.toLocaleString("en-US")}` : ""}</p>
        </div>
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search a ticker")} className="h-11 w-full rounded-xl border border-border bg-transparent pl-9 pr-3 text-[15px] outline-none focus:border-foreground/40" />
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {([["holders", tr("Top 100")], ["new", tr("New")], ["progress", tr("Mint progress")]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setSort(k)} className={`h-10 shrink-0 rounded-xl px-4 text-[15px] font-semibold ${sort === k ? "bg-muted text-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}>{label}</button>
        ))}
      </div>

      {!data ? <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        : !data.tokens.length ? (
          <div className="mt-10 rounded-3xl border border-border p-6 text-center">
            <p className="text-[16px] font-bold text-foreground">{data.indexed ? tr("No token found") : tr("DRC-20 indexing is starting")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{data.indexed ? tr("Try another ticker.") : tr("Tokens appear here as soon as the Dogecoin indexer has read the chain.")}</p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {data.tokens.slice(0, 100).map((t, i) => (
              <li key={t.tick}>
                <Link href={`/drc20/${encodeURIComponent(t.tick)}`} className="flex items-center gap-3 py-3">
                  {ranked && <span className={`num w-7 shrink-0 text-center text-[13px] font-bold ${i < 3 ? "text-foreground" : "text-muted-foreground"}`}>{i + 1}</span>}
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-muted text-[13px] font-bold uppercase text-foreground">{t.tick.slice(0, 4)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-bold uppercase text-foreground">{t.tick}</p>
                    <div className="mt-1 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground" style={{ width: `${Math.min(100, t.progress)}%` }} /></div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-[15px] font-bold text-foreground">{t.holders.toLocaleString("en-US")} <span className="text-[12px] font-semibold text-muted-foreground">{tr("holders")}</span></p>
                    <p className="num text-[12px] text-muted-foreground">{t.progress.toFixed(t.progress < 10 ? 2 : 1)}% {tr("minted")} · {drcAmount(t.max, t.dec)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </main>
  );
}
