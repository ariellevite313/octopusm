"use client";

/** Page Activité (ouverte dans une autre fenêtre) : toutes mes actions et celles de mon Janus, filtres par date et par token */
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useT } from "@/lib/i18n";
import { ActivityList } from "./activity";

function Inner() {
  const { tr } = useT();
  const sp = useSearchParams();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-6 md:pb-12">
      <h1 className="text-2xl font-bold tracking-tight">{tr("Activity")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{tr("Your limit orders and swaps, and everything your Janus did or could not do.")}</p>
      <div className="mt-5"><ActivityList key={sp.get("mint") ?? ""} mint={sp.get("mint")} /></div>
    </div>
  );
}

export function ActivityPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
