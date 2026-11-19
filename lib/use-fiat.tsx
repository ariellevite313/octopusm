"use client";
/** Monnaie locale choisie (mémorisée dans le navigateur) et conversion d'affichage des montants en USD. */
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatFiat, isFiat } from "@/lib/fiat";

const KEY = "octo-fiat";
const EVT = "octo-fiat-change";

export function useFiat() {
  const [code, setCode] = useState("USD");
  useEffect(() => {
    const read = () => { try { const s = localStorage.getItem(KEY); setCode(isFiat(s) ? s : "USD"); } catch { /* ignore */ } };
    read();
    window.addEventListener(EVT, read);
    return () => window.removeEventListener(EVT, read);
  }, []);
  const { data } = useQuery({
    queryKey: ["fiat-rates"], staleTime: 3600_000, enabled: code !== "USD",
    queryFn: async () => ((await (await fetch("/api/fiat-rates")).json()) as { rates?: Record<string, number> }).rates ?? {},
  });
  const rate = data?.[code] ?? 0;
  const setFiat = useCallback((c: string) => {
    try { localStorage.setItem(KEY, c); } catch { /* ignore */ }
    window.dispatchEvent(new Event(EVT));
  }, []);
  // Tant que le taux n'est pas là, on affiche en USD plutôt qu'un montant faux
  const active = code === "USD" || !rate ? "USD" : code;
  return { code, setFiat, money: (usd: number) => formatFiat(usd, active, rate) };
}
