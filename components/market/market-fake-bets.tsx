"use client";

import { useEffect, useRef, useState } from "react";

export type FakeBet = { id: number; optionIndex: number; amount: number };

export function useFakeLiveBets(optionCount: number, isLive = false): FakeBet[] {
  const [bets, setBets] = useState<FakeBet[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    if (optionCount === 0 || isLive) return;
    let timeout: ReturnType<typeof setTimeout>;

    const schedule = () => {
      const delay = 3000 + Math.random() * 7000;
      timeout = setTimeout(() => {
        const newBets: FakeBet[] = Array.from({ length: 2 }, () => ({
          id: ++counter.current,
          optionIndex: Math.floor(Math.random() * optionCount),
          amount: Math.floor(Math.random() * 24) + 2,
        }));
        setBets((prev) => [...prev, ...newBets]);
        const ids = newBets.map((b) => b.id);
        setTimeout(() => setBets((prev) => prev.filter((b) => !ids.includes(b.id))), 1500);
        schedule();
      }, delay);
    };

    schedule();
    return () => clearTimeout(timeout);
  }, [optionCount, isLive]);

  return bets;
}

export function FakeBetOverlay({
  optionIndex,
  bets,
}: {
  optionIndex: number;
  bets: FakeBet[];
}) {
  const active = bets.filter((b) => b.optionIndex === optionIndex);
  if (active.length === 0) return null;
  return (
    <>
      {active.map((bet, i) => (
        <span
          key={bet.id}
          className="animate-float-bet pointer-events-none absolute bottom-full left-1/2 mb-1 text-xs font-bold text-emerald-500 drop-shadow-sm"
          style={{
            transform: `translateX(calc(-50% + ${(i - 0.5) * 16}px))`,
            whiteSpace: "nowrap",
          }}
        >
          +${bet.amount}
        </span>
      ))}
    </>
  );
}
