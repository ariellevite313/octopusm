"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Minus, ShieldCheck, ShieldAlert, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { Security } from "@/lib/terminal-security";

/** Bouton « Important » : ouvre la fiche sécurité du token (autorités, LP, top 10, dev, insiders, taxes, risques signalés). */
export type AlertInfo = { count: number; tone: string; label: string };

export function SecurityCard({ chain, mint, bare, onInfo }: { chain: string; mint: string; bare?: boolean; onInfo?: (i: AlertInfo | null) => void }) {
  const { tr } = useT();
  const [s, setS] = useState<Security | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let off = false;
    setS(null);
    fetch(`/api/terminal/security?chain=${chain}&mint=${encodeURIComponent(mint)}`)
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (!off && j?.available) setS(j); }).catch(() => {});
    return () => { off = true; };
  }, [chain, mint]);
  const bad0 = s ? s.checks.filter((c) => c.ok === false).length + s.risks.filter((r) => r.level === "danger").length : 0;
  const tone0 = !s ? "" : s.rugged || bad0 >= 3 ? "#dc2626" : bad0 > 0 ? "#d97706" : "var(--color-up, #16a34a)";
  const label0 = !s ? "" : s.rugged ? tr("Rugged") : bad0 ? tr("{n} warnings", { n: bad0 }) : tr("No issue found");
  useEffect(() => { onInfo?.(s ? { count: bad0, tone: tone0, label: label0 } : null); }, [s, bad0, tone0, label0]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;

  const bad = s.checks.filter((c) => c.ok === false).length + s.risks.filter((r) => r.level === "danger").length;
  const tone = s.rugged || bad >= 3 ? "#dc2626" : bad > 0 ? "#d97706" : "var(--color-up, #16a34a)";
  const Icon = bad ? ShieldAlert : ShieldCheck;

  const label = s.rugged ? tr("Rugged") : bad ? tr("{n} warnings", { n: bad }) : tr("No issue found");

  const secBody = (
    <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-border bg-card p-4">
              {s.checks.map((c) => (
                <div key={c.key} className="min-w-0">
                  <p className="truncate text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{tr(c.label)}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-foreground">
                    {c.ok === true ? <Check className="size-3.5 shrink-0 text-up" /> : c.ok === false ? <X className="size-3.5 shrink-0 text-down" /> : <Minus className="size-3.5 shrink-0 text-muted-foreground" />}
                    <span className="num truncate">{tr(c.value)}</span>
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 px-1">
              {s.risks.length === 0 ? <p className="py-1 text-[12.5px] text-muted-foreground">{tr("No other risk reported.")}</p> : s.risks.map((r) => (
                <div key={r.name} className="flex items-start gap-2 py-1.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: r.level === "danger" ? "#dc2626" : r.level === "warn" ? "#d97706" : "var(--muted-foreground)" }} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground">{r.name}</p>
                    <p className="text-[12px] text-muted-foreground">{r.description}</p>
                  </div>
                </div>
              ))}
              <p className="pt-2 text-[11px] text-muted-foreground">{tr("Data: {src}. Always do your own research.", { src: s.source === "rugcheck" ? "RugCheck" : "GoPlus" })}</p>
            </div>
    </>
  );
  if (bare) return secBody;

  return (
    <>
      <button onClick={() => setOpen(true)} className="mx-4 mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground hover:bg-muted">
        <Icon className="size-4" style={{ color: tone }} />
        {tr("Important")}
        <span className="rounded-md px-1.5 py-[2px] text-[10px] font-bold uppercase tracking-wider" style={{ color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)` }}>{label}</span>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" className="relative max-h-[92vh] w-full max-w-md overflow-y-auto scrollbar-none rounded-t-[28px] border-t border-border bg-background px-4 pb-8 pt-2 md:rounded-[28px] md:border">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[17px] font-bold">
                <Icon className="size-5" style={{ color: tone }} />{tr("Security")}
                <span className="rounded-md px-1.5 py-[2px] text-[10px] font-bold uppercase tracking-wider" style={{ color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)` }}>{label}</span>
              </span>
              <button onClick={() => setOpen(false)} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
            </div>
            {secBody}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
