"use client";

/**
 * Style Pump.fun : quand la valeur suivie change (nouveau trade, prix, capitalisation), le bloc secoue
 * et s'éclaire en vert (hausse) ou en rouge (baisse). Rien au premier affichage.
 */
import { useEffect, useRef, useState } from "react";

export function TradeFlash({ v, children, className = "" }: { v: number | null | undefined; children: React.ReactNode; className?: string }) {
  const prev = useRef(v);
  const [fx, setFx] = useState<{ cls: string; k: number }>({ cls: "", k: 0 });
  useEffect(() => {
    const p = prev.current;
    if (p != null && v != null && Number.isFinite(p) && Number.isFinite(v) && v !== p) setFx((f) => ({ cls: v > p ? "pf-up" : "pf-down", k: f.k + 1 }));
    prev.current = v;
  }, [v]);
  useEffect(() => {
    if (!fx.cls) return;
    const t = setTimeout(() => setFx((f) => ({ ...f, cls: "" })), 1100);
    return () => clearTimeout(t);
  }, [fx.k, fx.cls]);
  return <div key={fx.k} className={`${fx.cls} ${className}`}>{children}</div>;
}
