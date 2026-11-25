"use client";

/**
 * Un seul bouton sous le graphique : « Important ». Il ouvre une fiche qui réunit
 * les alertes de sécurité du token et l'activité du dev (Solana). Le bouton n'apparaît que s'il y a quelque chose à montrer.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { SecurityCard, type AlertInfo } from "@/components/terminal/security-card";
import { DevAlert } from "@/components/terminal/dev-alert";

export function ChartAlerts({ chain, mint, withSecurity, withDev }: { chain: string; mint: string; withSecurity: boolean; withDev: boolean }) {
  const { tr } = useT();
  const [sec, setSec] = useState<AlertInfo | null>(null);
  const [dev, setDev] = useState<AlertInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!withSecurity && !withDev) return null;

  const items = [sec, dev].filter(Boolean) as AlertInfo[];
  const bad = items.reduce((n, i) => n + (i.count > 0 ? i.count : 0), 0);
  // Teinte du bouton : la plus grave des alertes
  const tone = dev && dev.count > 0 ? dev.tone : sec?.tone ?? dev?.tone ?? "var(--muted-foreground)";
  const Icon = bad ? ShieldAlert : ShieldCheck;
  const label = items.length === 0 ? "" : bad ? tr("{n} warnings", { n: bad }) : tr("No issue found");

  return (
    <>
      {items.length > 0 && (
        <button onClick={() => setOpen(true)} className="mx-4 mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground hover:bg-muted">
          <Icon className="size-4" style={{ color: tone }} />
          {tr("Important")}
          <span className="rounded-md px-1.5 py-[2px] text-[10px] font-bold uppercase tracking-wider" style={{ color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)` }}>{label}</span>
        </button>
      )}
      {mounted && createPortal(
        // Toujours monté (caché) pour que les données se chargent avant le clic
        <div style={{ display: open ? undefined : "none" }} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" className="relative max-h-[92vh] w-full max-w-md overflow-y-auto scrollbar-none rounded-t-[28px] border-t border-border bg-background px-4 pb-8 pt-4 md:rounded-[28px] md:border">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[17px] font-bold"><Icon className="size-5" style={{ color: tone }} />{tr("Important")}</span>
              <button onClick={() => setOpen(false)} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
            </div>
            {withDev && <DevAlert mint={mint} bare onInfo={setDev} />}
            {withSecurity && <div className={withDev && dev ? "mt-4" : ""}>{sec && <p className="mb-2 text-[13px] font-semibold">{tr("Security")}</p>}<SecurityCard chain={chain} mint={mint} bare onInfo={setSec} /></div>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
