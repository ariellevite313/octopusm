"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BarChart2 } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { MarketGrid } from "./market-grid";
import { TrendingSection } from "./trending-section";
import type { UnifiedMarket } from "@/lib/supabase/types";
import type { MarketVolumes } from "@/lib/market/utils";

// ─── Module-level cache (survives React navigation, cleared on page reload) ────
interface CacheEntry {
  markets: UnifiedMarket[];
  volumes: MarketVolumes;
  ts: number;
}
const _cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000; // 1 minute

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** undefined = home page (toutes catégories) */
  category?: string;
  /** Marchés chargés côté serveur — affichés immédiatement sans délai */
  initialMarkets: UnifiedMarket[];
}

export function MarketsClient({ category, initialMarkets }: Props) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const key = category ?? "__all__";
  const cached = _cache.get(key);

  const handleCreateClick = useCallback(() => {
    if (isAuthenticated) {
      router.push("/dashboard/pools");
    } else {
      // Ouvre le dialog de connexion wallet + mémorise la destination
      router.push("/?returnTo=/dashboard/pools");
      window.dispatchEvent(new CustomEvent("open-wallet-connect"));
    }
  }, [isAuthenticated, router]);

  const [markets, setMarkets] = useState<UnifiedMarket[]>(
    cached?.markets ?? initialMarkets
  );
  const [volumes, setVolumes] = useState<MarketVolumes>(
    cached?.volumes ?? {}
  );
  const fetchingRef = useRef(false);

  useEffect(() => {
    // Reset fetch flag when category changes
    fetchingRef.current = false;
  }, [key]);

  useEffect(() => {
    if (fetchingRef.current) return;

    const entry = _cache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL) {
      // Données fraîches en cache → applique sans réseau
      setMarkets(entry.markets);
      setVolumes(entry.volumes);
      fetchingRef.current = true;
      return;
    }

    // Fetch depuis l'API (non bloquant — la page est déjà affichée)
    fetchingRef.current = true;
    const url = category
      ? `/api/markets?category=${encodeURIComponent(category)}`
      : "/api/markets";

    fetch(url)
      .then((r) => r.json())
      .then(({ markets: m, volumes: v }: { markets: UnifiedMarket[]; volumes: MarketVolumes }) => {
        _cache.set(key, { markets: m, volumes: v, ts: Date.now() });
        setMarkets(m);
        setVolumes(v);
      })
      .catch((err) => {
        console.error("[markets-client] fetch failed:", err);
        fetchingRef.current = false; // allow retry on next render
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const emptyMsg = category
    ? "No active markets in this category."
    : "No active markets right now.";

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-0">
      {/* Trending section — home page only */}
      {!category && <TrendingSection />}

      {markets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span className="text-5xl">🐙</span>
          <p className="text-muted-foreground">{emptyMsg}</p>
        </div>
      ) : (
        <MarketGrid markets={markets} volumes={volumes} showCategoryTabs={false} />
      )}
    </div>
  );
}
