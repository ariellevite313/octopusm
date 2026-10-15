"use client";

import { useEffect, useState } from "react";
import type { PmEvent, PmStateLean } from "@/lib/polymarket";

export type FeaturedData = { featured: PmEvent[]; usMap: Record<string, PmStateLean> };

let _cache: FeaturedData | null = null;

/** Annonces à la une : se mettent à jour toutes seules (60 s et au retour sur l'onglet). */
export function useFeatured(): FeaturedData | null {
  const [data, setData] = useState<FeaturedData | null>(_cache);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/polymarket/home")
        .then((r) => r.json())
        .then((d: FeaturedData) => {
          if (alive && Array.isArray(d.featured)) { _cache = { featured: d.featured, usMap: d.usMap ?? {} }; setData(_cache); }
        })
        .catch(() => { /* on garde les dernières données */ });
    load();
    const t = setInterval(load, 60_000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return data;
}
