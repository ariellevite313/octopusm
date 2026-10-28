"use client";

import { useCallback, useEffect, useState } from "react";
import type { Board } from "@/lib/hackathon/leaderboard";
import type { MyVotes } from "@/lib/hackathon/my-votes";

function useFetch<T>(url: string, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: T) => { setData(d); setError(false); })
      .catch((s) => setError(s !== 401 ? true : false));
  }, [url]);
  useEffect(() => {
    load();
    if (!refreshMs) return;
    const id = setInterval(load, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs]);
  return { data, error, reload: load };
}

export const useBoard = () => useFetch<Board>("/api/hackathon/leaderboard", 30_000);
export const useMyVotes = () => useFetch<MyVotes>("/api/hackathon/my-votes");

export const usd0 = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ")} $`;
export const usd2 = (n: number) => `${n.toFixed(n >= 1 ? 2 : 4)} $`;
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : `${Math.round(n)}`);
export const CATEGORY_LABEL: Record<string, string> = { ai_agents: "AI Agents", defi: "DeFi", gaming: "Gaming", payments: "Payments", social: "Social", other: "Other" };
