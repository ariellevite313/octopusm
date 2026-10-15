"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Simulation d'activité (marchés de prédiction uniquement) :
 * des « +$12 », « +$13 »… montent en continu au-dessus des options,
 * comme des mises qui arrivent. Actif seulement si le marché a déjà du volume.
 */
export type FakeBet = { id: number; optionIndex: number; amount: number };

export function useFakeLiveBets(optionCount: number, disabled = false): FakeBet[] {
  const [bets, setBets] = useState<FakeBet[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    if (optionCount === 0 || disabled) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timeout: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timeout = setTimeout(() => {
        if (document.visibilityState === "visible") {
          const bet: FakeBet = {
            id: ++counter.current,
            optionIndex: Math.floor(Math.random() * optionCount),
            amount: [1, 2, 3, 4, 5, 6, 10, 10, 12, 13, 14, 25][Math.floor(Math.random() * 12)],
          };
          setBets((prev) => [...prev.slice(-6), bet]);
          setTimeout(() => setBets((prev) => prev.filter((b) => b.id !== bet.id)), 1800);
        }
        schedule();
      }, 380 + Math.random() * 520);
    };

    schedule();
    return () => clearTimeout(timeout);
  }, [optionCount, disabled]);

  return bets;
}

/** Couleur : 1re option verte (Up / Oui), dernière rouge (Down / Non), milieu neutre. */
export function FakeBetOverlay({
  optionIndex,
  bets,
  optionCount = 2,
}: {
  optionIndex: number;
  bets: FakeBet[];
  optionCount?: number;
}) {
  const active = bets.filter((b) => b.optionIndex === optionIndex);
  if (active.length === 0) return null;
  const isFirst = optionIndex === 0;
  const isLast = optionIndex === optionCount - 1;
  const color = isFirst ? "text-up" : isLast ? "text-down" : "text-muted-foreground";
  const side = isFirst ? "left-3" : isLast ? "right-3" : "left-1/2 -translate-x-1/2";
  return (
    <span className={`pointer-events-none absolute bottom-1.5 z-10 h-10 w-12 ${side}`} aria-hidden>
      {active.map((bet) => (
        <span
          key={bet.id}
          className={`bet-rise num absolute bottom-0 whitespace-nowrap text-[11px] font-bold ${color} ${isLast && !isFirst ? "right-0" : "left-0"}`}
        >
          +${bet.amount}
        </span>
      ))}
    </span>
  );
}
