/**
 * SupabaseProvider
 *
 * Provider React qui :
 * 1. Écoute les changements de session Supabase Auth
 * 2. Initialise tous les stores au démarrage (marchés, listings, registry)
 * 3. Initialise les stores wallet-spécifiques après connexion
 * 4. Expose le wallet connecté via contexte React
 *
 * Optimisations appliquées :
 * - Pas de double appel initPredictionStore() : si une session wallet est déjà
 *   présente au chargement, on va directement sur initPrivateStores (qui inclut
 *   initPredictionStore avec wallet) sans passer par initPublicStores.
 * - isAdminWallet() s'exécute EN PARALLÈLE avec initPredictionStore et
 *   initAIListingStore au lieu de les bloquer (~200ms gagnés par connexion).
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { initPredictionStore } from "@/components/octopus-market/prediction-market-store";
import { useMarketsRefresh } from "@/hooks/use-markets-refresh";
import { initAIListingStore } from "@/components/octopus-market/ai-listing-store";
import { initCentralRegistry } from "@/components/octopus-market/octopus-central-registry";
import { initAdminNotifications } from "@/components/octopus-market/octopus-admin";
import { isAdminWallet } from "@/services/auth/wallet-auth";

// ─── Contexte ─────────────────────────────────────────────────────────────────

interface SupabaseContextValue {
  walletAddress: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const SupabaseContext = createContext<SupabaseContextValue>({
  walletAddress: null,
  isAdmin: false,
  isLoading: true,
  isAuthenticated: false,
});

export function useSupabaseSession() {
  return useContext(SupabaseContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface SupabaseProviderProps {
  children: React.ReactNode;
}

export function SupabaseProvider({ children }: SupabaseProviderProps) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Stale-while-revalidate + refetchOnWindowFocus pour les marchés.
  // Ne déclenche pas de double fetch si initPredictionStore vient de tourner
  // (initialDataUpdatedAt = timestamp localStorage → React Query sait que c'est frais).
  useMarketsRefresh();

  // ── Init stores publics (visiteur anonyme) ────────────────────────────────
  const initPublicStores = useCallback(async () => {
    await Promise.all([
      initPredictionStore(),       // marchés sans historique
      initAIListingStore("public"), // listings approuvés
    ]);
  }, []);

  // ── Init stores privés (wallet connecté) ──────────────────────────────────
  // isAdminWallet() s'exécute EN PARALLÈLE avec initPredictionStore et
  // initAIListingStore pour ne pas bloquer le chargement des marchés.
  const initPrivateStores = useCallback(async (address: string) => {
    const [adminStatus] = await Promise.all([
      isAdminWallet(),                      // RPC → lancé en même temps que les stores
      initPredictionStore(address),         // marchés + historique wallet
      initAIListingStore("wallet", address), // listings du wallet
    ]);

    setIsAdmin(adminStatus);

    // Les stores admin dépendent du statut confirmé → lancés après
    if (adminStatus) {
      await Promise.all([
        initCentralRegistry(),
        initAdminNotifications(true),
        initAIListingStore("admin"),
      ]);
    }
  }, []);

  useEffect(() => {
    // ── Stratégie de démarrage ────────────────────────────────────────────
    // On vérifie d'abord la session existante AVANT de lancer quoi que ce soit.
    // Si une session wallet est active → on saute initPublicStores et on va
    // directement sur initPrivateStores (qui appelle déjà initPredictionStore).
    // Cela évite le double appel à getActiveMarkets() pour les utilisateurs connectés.
    supabase.auth.getSession()
      .then(async ({ data }) => {
        const address: string | undefined =
          data.session?.user?.user_metadata?.wallet_address;

        if (data.session && address) {
          // Session wallet active → init privé uniquement (inclut les marchés)
          setWalletAddress(address);
          await initPrivateStores(address).catch((err) =>
            console.warn("[supabase-provider] initPrivateStores failed:", err)
          );
        } else {
          // Pas de session → init public uniquement
          await initPublicStores().catch((err) =>
            console.warn("[supabase-provider] initPublicStores failed:", err)
          );
        }
      })
      .catch((err) => {
        // getSession() a échoué (Supabase indisponible, réseau coupé)
        // → on tente quand même le mode public pour afficher les marchés
        console.warn("[supabase-provider] getSession failed:", err);
        void initPublicStores().catch(() => null);
      })
      .finally(() => setIsLoading(false));

    // ── Écouter les connexions / déconnexions suivantes ───────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const address: string | undefined =
          session?.user?.user_metadata?.wallet_address;

        if (session && address) {
          setWalletAddress(address);
          await initPrivateStores(address).catch((err) =>
            console.warn("[supabase-provider] initPrivateStores (auth change) failed:", err)
          );
        } else {
          setWalletAddress(null);
          setIsAdmin(false);
          // Après déconnexion → repasser en mode public
          await initPublicStores().catch((err) =>
            console.warn("[supabase-provider] initPublicStores (logout) failed:", err)
          );
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [initPublicStores, initPrivateStores]);

  return (
    <SupabaseContext.Provider
      value={{
        walletAddress,
        isAdmin,
        isLoading,
        isAuthenticated: !!walletAddress,
      }}
    >
      {children}
    </SupabaseContext.Provider>
  );
}
