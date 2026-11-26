"use client";

/**
 * Style Pump.fun : quand la valeur suivie change (nouveau trade, prix, capitalisation), le bloc secoue
 * et s'éclaire en vert (hausse) ou en rouge (baisse). Rien au premier affichage.
 * L'animation redémarre sans remonter le contenu (un graphique ou une saisie à l'intérieur ne sont pas rechargés).
 */
import { useEffect, useRef, useState } from "react";

export function TradeFlash({ v, children, className = "" }: { v: number | null | undefined; children: React.ReactNode; className?: string }) {
  const prev = useRef(v);
  const [cls, setCls] = useState("");
  useEffect(() => {
    const p = prev.current;
    prev.current = v;
    if (p == null || v == null || !Number.isFinite(p) || !Number.isFinite(v) || v === p) return;
    const next = v > p ? "pf-up" : "pf-down";
    setCls("");
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setCls(next)); });
    const t = setTimeout(() => setCls(""), 1200);
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); clearTimeout(t); };
  }, [v]);
  return <div className={`${cls} ${className}`}>{children}</div>;
}
