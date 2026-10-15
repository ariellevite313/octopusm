"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Bulles « +$12 » qui montent et s'effacent (simulation d'activité) —
 * affichées uniquement pour les tokens qui ont déjà du volume.
 * Les montants sont tirés autour du volume moyen par minute du token.
 */
type Bubble = { id: number; text: string; buy: boolean; x: number };

function fmt(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.max(1, Math.round(n))}`;
}

export function LiveTradeBubbles({ volume24h, className = "" }: { volume24h: number | null | undefined; className?: string }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const vol = volume24h ?? 0;

  useEffect(() => {
    if (vol <= 0) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let visible = false;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.1 });
    if (ref.current) io.observe(ref.current);

    const perMinute = vol / 1440;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (visible && document.visibilityState === "visible") {
        const amount = Math.min(perMinute * (0.25 + Math.random() * 1.75), Math.max(vol / 20, 1));
        const buy = Math.random() > 0.3;
        const b: Bubble = { id: ++idRef.current, text: `+${fmt(amount)}`, buy, x: Math.round(Math.random() * 18) };
        setBubbles((prev) => [...prev.slice(-3), b]);
        setTimeout(() => setBubbles((prev) => prev.filter((p) => p.id !== b.id)), 1700);
      }
      timer = setTimeout(tick, 650 + Math.random() * 900);
    };
    timer = setTimeout(tick, Math.random() * 800);
    return () => { clearTimeout(timer); io.disconnect(); };
  }, [vol]);

  if (vol <= 0) return null;

  return (
    <div ref={ref} aria-hidden className={`pointer-events-none absolute ${className}`}>
      {bubbles.map((b) => (
        <span
          key={b.id}
          className={`trade-bubble num absolute bottom-0 whitespace-nowrap rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-bold backdrop-blur-sm ${b.buy ? "text-emerald-300" : "text-red-300"}`}
          style={{ right: b.x }}
        >
          {b.text}
        </span>
      ))}
    </div>
  );
}
