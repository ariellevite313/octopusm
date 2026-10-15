"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { useT } from "@/lib/i18n";

// Mise en page de la page d'un token : onglets (Commentaires / À propos)
// + panneau de trading. Sur mobile, le trading s'ouvre depuis un gros
// bouton fixe en bas ; sur ordinateur il reste dans la colonne de droite.

type Tab = "comments" | "holders" | "about";

export function TokenDetailShell({
  chart, trade, comments, about, holders, ticker,
}: {
  chart?: React.ReactNode; trade: React.ReactNode; comments: React.ReactNode; about: React.ReactNode; holders?: React.ReactNode; ticker: string;
}) {
  const { tr } = useT();
  const [tab, setTab] = useState<Tab>("comments");
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  const TABS: { id: Tab; label: string }[] = [
    { id: "comments", label: tr("Comments") },
    ...(holders ? [{ id: "holders" as Tab, label: tr("Holders") }] : []),
    { id: "about",    label: tr("About") },
  ];

  return (
    <>
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-6">
        {/* Chart + tabs */}
        <div className="min-w-0">
          {chart && <div className="mb-4 space-y-4">{chart}</div>}
          <div className="sticky top-16 z-20 -mx-4 flex border-b border-border bg-background/95 px-4 md:static md:mx-0 md:px-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 border-b-2 py-3.5 text-[15px] font-bold transition-colors md:flex-none md:px-5 ${
                  tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="pt-5">
            <div hidden={tab !== "comments"}>{comments}</div>
            {holders && tab === "holders" && <div>{holders}</div>}
            <div hidden={tab !== "about"}>{about}</div>
          </div>
        </div>

        {/* Trade panel : bottom sheet on mobile, sticky column on desktop */}
        <div
          className={`fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-[28px] border-t border-border bg-card px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-3 transition-transform duration-300 ease-out md:sticky md:top-20 md:z-auto md:max-h-none md:translate-y-0 md:overflow-visible md:rounded-[24px] md:border md:p-4 ${
            sheet ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between md:hidden">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-muted" />
          </div>
          <div className="mb-3 flex items-center justify-between md:hidden">
            <span className="text-lg font-bold tracking-tight text-foreground">{tr("Trade ${ticker}", { ticker })}</span>
            <button type="button" onClick={() => setSheet(false)} aria-label={tr("Close")} className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-2">{trade}</div>
        </div>
      </div>

      {/* Mobile : backdrop + big trade button */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity md:hidden ${sheet ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setSheet(false)}
        aria-hidden
      />
      <button
        type="button"
        onClick={() => setSheet(true)}
        className={`btn-primary fixed inset-x-4 bottom-[calc(92px+env(safe-area-inset-bottom,0px))] z-30 flex h-14 items-center justify-center gap-2 rounded-2xl text-[17px] md:hidden ${sheet ? "hidden" : ""}`}
      >
        <ArrowLeftRight className="size-5" />
        {tr("Buy / Sell")}
      </button>
      {/* Espace pour que la fin de page ne passe pas sous le bouton */}
      <div className="h-20 md:hidden" aria-hidden />
    </>
  );
}
