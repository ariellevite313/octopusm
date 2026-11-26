"use client";

/** Le wallet connecté porte-t-il la couronne (top 5 des gains sur OM) ? Une seule requête par page. */
import { useEffect, useState } from "react";

let req: Promise<boolean> | null = null;
export function useCrown(): boolean {
  const [me, setMe] = useState(false);
  useEffect(() => {
    req ??= fetch("/api/crown", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: { me?: boolean } | null) => !!j?.me).catch(() => false);
    let off = false;
    void req.then((v) => { if (!off) setMe(v); });
    return () => { off = true; };
  }, []);
  return me;
}
/** Prix d'un boost en Omero pour un porteur de couronne (-30 %), comme le serveur le calcule. */
export const crownPrice = (cost: number, crown: boolean) => (crown ? Math.round(cost * 0.7) : cost);
