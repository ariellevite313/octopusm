"use client";

import { useEffect, useState } from "react";
import { Featured } from "@/components/market/featured";
import type { PmEvent, PmStateLean } from "@/lib/polymarket";

type Data = { featured: PmEvent[]; usMap: Record<string, PmStateLean> };

/** Vitrine « à la une » de l'accueil des marchés : se met à jour toute seule (toutes les 60 s et au retour sur l'onglet). */
export function FeaturedHome() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/polymarket/home")
        .then((r) => r.json())
        .then((d: Data) => { if (alive && Array.isArray(d.featured)) setData({ featured: d.featured, usMap: d.usMap ?? {} }); })
        .catch(() => { /* on garde les dernières données */ });
    load();
    const t = setInterval(load, 60_000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, []);

  if (!data || data.featured.length === 0) return null;
  return (
    <div className="mt-4">
      <Featured events={data.featured} usMap={data.usMap} />
    </div>
  );
}
