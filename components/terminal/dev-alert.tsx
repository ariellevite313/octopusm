"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { DevInfo } from "@/lib/terminal-dev";
import type { AlertInfo } from "@/components/terminal/security-card";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const num = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const pct = (n: number) => (n >= 1 ? `${n.toFixed(1)}%` : n >= 0.01 ? `${n.toFixed(2)}%` : n > 0 ? "<0.01%" : "0%");

function ago(t: number | null, tr: (s: string, v?: Record<string, string | number>) => string): string {
  if (!t) return "";
  const s = Math.max(0, Date.now() / 1000 - t);
  if (s < 3600) return tr("{n} min ago", { n: Math.max(1, Math.round(s / 60)) });
  if (s < 86400) return tr("{n} h ago", { n: Math.round(s / 3600) });
  return tr("{n} d ago", { n: Math.round(s / 86400) });
}

const RED = "#dc2626";

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="num inline-flex items-center gap-0.5 font-medium text-foreground/90 transition-colors hover:text-foreground">
      {children}
      <ArrowUpRight className="size-3 opacity-60" />
    </a>
  );
}

/** Activité du dev (Terminal uniquement) : ventes sur DEX et envois directs séparés, ce qu'il détient encore, destinataires. */
export function DevAlert({ mint, bare, onInfo }: { mint: string; bare?: boolean; onInfo?: (i: AlertInfo | null) => void }) {
  const { tr } = useT();
  const [d, setD] = useState<DevInfo | null>(null);
  useEffect(() => {
    let off = false;
    setD(null);
    fetch(`/api/terminal/dev?mint=${encodeURIComponent(mint)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!off && j && !j.error && !j.exempt) setD(j); }).catch(() => {});
    return () => { off = true; };
  }, [mint]);
  const shown = !!d && !!d.dev && (d.status === "selling" || d.status === "sold_all" || d.status === "sending");
  const dSt = d?.status;
  useEffect(() => {
    onInfo?.(!shown ? null : { count: dSt === "sending" ? 0 : 1, tone: dSt === "sending" ? "var(--muted-foreground)" : "#dc2626", label: dSt === "sold_all" ? tr("Sold out") : dSt === "sending" ? tr("Transfers") : tr("Selling") });
  }, [shown, dSt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d || !d.dev || !shown) return null;

  const sending = d.status === "sending";
  const tone = sending ? "var(--muted-foreground)" : RED;
  const label = d.status === "sold_all" ? tr("Sold out") : sending ? tr("Transfers") : tr("Selling");
  const lastSale = d.moves.find((m) => m.kind === "sale");
  const lastSend = d.moves.find((m) => m.kind === "transfer");
  const recipients = [...new Map(d.moves.filter((m) => m.kind === "transfer").flatMap((m) => m.recipients).map((r) => [r.owner, r])).values()].slice(0, 4);

  // Répartition de ce que le dev a eu : détenu / vendu / envoyé
  const total = d.holds + d.soldTotal + d.sentTotal || 1;
  const bars = [
    { w: (d.holds / total) * 100, c: "var(--foreground)", o: 0.55 },
    { w: (d.soldTotal / total) * 100, c: RED, o: 1 },
    { w: (d.sentTotal / total) * 100, c: "var(--muted-foreground)", o: 0.6 },
  ];

  const stats = [
    { k: tr("Held"), v: num(d.holds), p: pct(d.holdsPct), show: true, dot: "var(--foreground)" },
    { k: tr("Sold"), v: num(d.soldTotal), p: pct(d.soldPct), show: !sending || d.soldTotal > 0, dot: RED },
    { k: tr("Sent"), v: num(d.sentTotal), p: pct(d.sentPct), show: d.sentTotal > 0 || sending, dot: "var(--muted-foreground)" },
  ].filter((s) => s.show);

  return (
    <section className={`relative overflow-hidden rounded-2xl border border-border bg-card ${bare ? "mt-3" : "mx-4 mt-4"}`}>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tone }} />

      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex size-2 shrink-0">
            {!sending && <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: tone }} />}
            <span className="relative inline-flex size-2 rounded-full" style={{ background: tone }} />
          </span>
          <span className="text-[13px] font-semibold tracking-tight text-foreground">{tr("Dev activity")}</span>
          <span className="rounded-md px-1.5 py-[2px] text-[10px] font-bold uppercase tracking-wider" style={{ color: tone, background: `color-mix(in srgb, ${sending ? "var(--muted-foreground)" : RED} 14%, transparent)` }}>{label}</span>
        </div>
        <span className="text-[12px] text-muted-foreground"><Link href={`https://solscan.io/account/${d.dev}`}>{short(d.dev)}</Link></span>
      </header>

      <div className="mx-4 flex h-1.5 overflow-hidden rounded-full bg-muted">
        {bars.map((b, i) => b.w > 0 && <span key={i} style={{ width: `${Math.max(b.w, 1.5)}%`, background: b.c, opacity: b.o }} />)}
      </div>

      <div className={`grid gap-px px-4 pb-1 pt-3 ${stats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {stats.map((s) => (
          <div key={s.k} className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ background: s.dot }} />{s.k}
            </p>
            <p className="num mt-1 truncate text-[16px] font-semibold leading-none text-foreground">{s.v}</p>
            <p className="num mt-1 text-[11.5px] text-muted-foreground">{s.p}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 border-t border-border/70 px-4 py-2.5 text-[12.5px]">
        {lastSale && (
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-muted-foreground">{tr("Last sale")}</span>
            <span className="flex items-center gap-2"><span className="text-muted-foreground">{ago(lastSale.time, tr)}</span><Link href={`https://solscan.io/tx/${lastSale.signature}`}>{short(lastSale.signature)}</Link></span>
          </div>
        )}
        {lastSend && (
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-muted-foreground">{tr("Last transfer")}</span>
            <span className="flex items-center gap-2"><span className="text-muted-foreground">{ago(lastSend.time, tr)}</span><Link href={`https://solscan.io/tx/${lastSend.signature}`}>{short(lastSend.signature)}</Link></span>
          </div>
        )}
        {recipients.length > 0 && (
          <div className="pt-1.5">
            <p className="pb-1 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{tr("Recipients")}</p>
            <div className="flex flex-wrap gap-1.5">
              {recipients.map((r) => (
                <a key={r.owner} href={`https://solscan.io/account/${r.owner}`} target="_blank" rel="noopener noreferrer" className="num inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2 py-1 text-[12px] transition-colors hover:bg-muted">
                  <span className="font-medium text-foreground">{short(r.owner)}</span>
                  <span className="text-muted-foreground">{num(r.amount)}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
