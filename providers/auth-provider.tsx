"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { isAdminWallet } from "@/lib/wallet/auth";
import type { WalletType } from "@/lib/wallet/adapters";

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue {
  walletAddress: string | null;
  walletType: WalletType | null;
  isAdmin: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  setWalletType: (type: WalletType | null) => void;
}

const AuthContext = createContext<AuthContextValue>({
  walletAddress: null,
  walletType: null,
  isAdmin: false,
  isLoading: true,
  isAuthenticated: false,
  setWalletType: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  const checkAdmin = useCallback(async () => {
    const admin = await isAdminWallet();
    setIsAdmin(admin);
  }, []);

  useEffect(() => {
    // Vérifier session existante au démarrage
    supabase.auth.getSession().then(({ data }) => {
      const address = data.session?.user?.user_metadata?.wallet_address;
      if (address) {
        setWalletAddress(address);
        void checkAdmin();
      }
      setIsLoading(false);
    });

    // Écouter les changements de session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const address = session?.user?.user_metadata?.wallet_address;
        if (address) {
          setWalletAddress(address);
          void checkAdmin();
        } else {
          setWalletAddress(null);
          setIsAdmin(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        walletAddress,
        walletType,
        isAdmin,
        isLoading,
        isAuthenticated: !!walletAddress,
        setWalletType,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
