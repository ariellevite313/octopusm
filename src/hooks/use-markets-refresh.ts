/**
 * use-markets-refresh.ts
 *
 * Hook React Query qui maintient les marchés à jour via stale-while-revalidate.
 *
 * Comportement :
 * - Utilise les données déjà en mémoire (peuplées par initPredictionStore) comme
 *   initialData → aucun flash de chargement au premier rendu.
 * - initialDataUpdatedAt = timestamp du cache localStorage → React Query sait
 *   si les données sont fraîches ou non sans faire un fetch supplémentaire.
 * - staleTime = 5 min → pas de double fetch si initPredictionStore vient de tourner.
 * - refetchOnWindowFocus = true → si l'utilisateur revient sur l'onglet après
 *   5 min d'absence, les marchés se rafraîchissent automatiquement en arrière-plan.
 * - Sur succès : refreshMarketsFromDB() met à jour le store et notifie tous les
 *   abonnés existants (subscribeToPredictionMarketStorage) → aucun composant à modifier.
 */

import { useQuery } from "@tanstack/react-query";
import {
  refreshMarketsFromDB,
  readAdminCreatedPredictionMarkets,
} from "@/components/octopus-market/prediction-market-store";

const MARKETS_QUERY_KEY = ["prediction-markets"] as const;
const STALE_MS = 5 * 60 * 1000; // 5 minutes
const LS_KEY = "octopus-markets-cache-v1";

/** Lit le timestamp du cache localStorage (0 si absent/invalide). */
function getLocalStorageCacheTimestamp(): number {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { ts?: number };
    return parsed.ts ?? 0;
  } catch {
    return 0;
  }
}

export function useMarketsRefresh(): void {
  useQuery({
    queryKey: MARKETS_QUERY_KEY,
    queryFn: refreshMarketsFromDB,

    // Seed immédiat depuis le cache mémoire du store (peuplé par initPredictionStore).
    // Évite un fetch React Query en doublon au premier montage.
    initialData: () => {
      const cached = readAdminCreatedPredictionMarkets();
      return cached.length > 0 ? cached : undefined;
    },

    // Indique à React Query quand ces données ont été fetchées pour la dernière fois.
    // Si initPredictionStore vient de tourner, le timestamp est récent → pas de refetch.
    initialDataUpdatedAt: getLocalStorageCacheTimestamp,

    staleTime: STALE_MS,
    gcTime: 10 * 60 * 1000,

    // ← Le vrai gain : refetch automatique quand l'utilisateur revient sur l'onglet
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}
