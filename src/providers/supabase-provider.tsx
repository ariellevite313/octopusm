/**
 * SupabaseProvider
 *
 * Provider React qui :
 * 1. Écoute les changements de session Supabase Auth
 * 2. Initialise tous les stores au démarrage (marchés, listings, registry)
 * 3. Initialise les stores wallet-spécifiques après connexion
 * 4. Expose le wallet connecté via contexte React
 *
 * À placer autour de <App /> dans main.tsx
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { initPredictionStore } from "@/components/octopus-market/prediction-market-store";
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

  // Initialisation des stores publics (sans wallet)
  const initPublicStores = useCallback(async () => {
    await Promise.all([
      initPredictionStore(),
      initAIListingStore("public"),
    ]);
  }, []);

  // Initialisation des stores privés (après connexion wallet)
  const initPrivateStores = useCallback(async (address: string) => {
    const adminStatus = await isAdminWallet();
    setIsAdmin(adminStatus);

    await Promise.all([
      initPredictionStore(address),
      initAIListingStore("wallet", address),
      ...(adminStatus
        ? [
            initCentralRegistry(),
            initAdminNotifications(true),
            initAIListingStore("admin"),
          ]
        : []),
    ]);
  }, []);

  useEffect(() => {
    // Initialiser les stores publics immédiatement
    // Le .finally() garantit que isLoading passe à false même si Supabase
    // est temporairement indisponible (projet en pause, réseau, etc.)
    void initPublicStores()
      .catch((err) => console.warn("[supabase-provider] initPublicStores failed:", err))
      .finally(() => setIsLoading(false));

    // Écouter les changements de session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const address: string | undefined =
          session?.user?.user_metadata?.wallet_address;

        if (session && address) {
          setWalletAddress(address);
          await initPrivateStores(address).catch((err) =>
            console.warn("[supabase-provider] initPrivateStores failed:", err)
          );
        } else {
          setWalletAddress(null);
          setIsAdmin(false);
          // Re-init les stores publics après déconnexion
          await initPublicStores().catch((err) =>
            console.warn("[supabase-provider] initPublicStores (logout) failed:", err)
          );
        }
      }
    );

    // Vérifier la session existante au chargement
    supabase.auth.getSession().then(async ({ data }) => {
      const address: string | undefined =
        data.session?.user?.user_metadata?.wallet_address;

      if (data.session && address) {
        setWalletAddress(address);
        await initPrivateStores(address);
      }
    });

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
