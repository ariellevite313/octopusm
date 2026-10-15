"use client";

import { useEffect, useState } from "react";
import { Featured } from "@/components/market/featured";
import type { PmEvent, PmStateLean } from "@/lib/polymarket";

type Data = { featured: PmEvent[]; usMap: Record<string, PmStateLean> };

/** Vitrine « à la une » de l'accueil des marchés : se met à jour toute seule (toutes les 60 s et au retour sur l'onglet). */
let _cache: Data | null = null;

export function FeaturedHome() {
  const [data, setData] = useState<Data | null>(_cache);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/polymarket/home")
        .then((r) => r.json())
        .then((d: Data) => { if (alive && Array.isArray(d.featured)) { _cache = { featured: d.featured, usMap: d.usMap ?? {} }; setData(_cache); } })
        .catch(() => { /* on garde les dernières données */ });
    load();
    const t = setInterval(load, 60_000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, []);

  // Emplacement réservé pendant le chargement : la page ne saute pas quand l'annonce arrive
  if (!data) return <div className="mt-4 h-[40rem] animate-pulse rounded-3xl border border-border bg-card/60 md:h-[30rem]" aria-hidden />;
  if (data.featured.length === 0) return null;
  return (
    <div className="mt-4">
      <Featured events={data.featured} usMap={data.usMap} />
    </div>
  );
}
