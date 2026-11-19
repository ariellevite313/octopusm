"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Minus, ShieldCheck, ShieldAlert, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { Security } from "@/lib/terminal-security";

/** Fiche sécurité du token (Terminal) : autorités, LP, top 10, dev, insiders, taxes, puis les risques signalés. */
export function SecurityCard({ chain, mint }: { chain: string; mint: string }) {
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
  if (!s) return null;

  const bad = s.checks.filter((c) => c.ok === false).length + s.risks.filter((r) => r.level === "danger").length;
  const tone = s.rugged || bad >= 3 ? "#dc2626" : bad > 0 ? "#d97706" : "var(--color-up, #16a34a)";
  const Icon = bad ? ShieldAlert : ShieldCheck;

  return (
    <section className="relative mx-4 mt-4 overflow-hidden rounded-2xl border border-border bg-card">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tone }} />
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-2">
          <Icon className="size-4" style={{ color: tone }} />
          <span className="text-[13px] font-semibold tracking-tight text-foreground">{tr("Security")}</span>
          <span className="rounded-md px-1.5 py-[2px] text-[10px] font-bold uppercase tracking-wider" style={{ color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)` }}>
            {s.rugged ? tr("Rugged") : bad ? tr("{n} warnings", { n: bad }) : tr("No issue found")}
          </span>
        </span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 pb-3 sm:grid-cols-3">
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

      {open && (
        <div className="border-t border-border/70 px-4 py-2.5">
          {s.risks.length === 0 ? <p className="py-1 text-[12.5px] text-muted-foreground">{tr("No other risk reported.")}</p> : s.risks.map((r) => (
            <div key={r.name} className="flex items-start gap-2 py-1.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: r.level === "danger" ? "#dc2626" : r.level === "warn" ? "#d97706" : "var(--muted-foreground)" }} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">{r.name}</p>
                <p className="text-[12px] text-muted-foreground">{r.description}</p>
              </div>
            </div>
          ))}
          <p className="pt-1.5 text-[11px] text-muted-foreground">{tr("Data: {src}. Always do your own research.", { src: s.source === "rugcheck" ? "RugCheck" : "GoPlus" })}</p>
        </div>
      )}
    </section>
  );
}
