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
import { detectChain, type ChainId } from "@/lib/chains";

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue {
  walletAddress:  string | null;
  walletType:     WalletType | null;
  selectedChain:  ChainId | null;   // auto-détecté depuis walletType
  isAdmin:        boolean;
  isLoading:      boolean;
  isAuthenticated: boolean;
  setWalletType:  (type: WalletType | null) => void;
}

const AuthContext = createContext<AuthContextValue>({
  walletAddress:  null,
  walletType:     null,
  selectedChain:  null,
  isAdmin:        false,
  isLoading:      true,
  isAuthenticated: false,
  setWalletType:  () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const LS_WALLET_TYPE_KEY = "octo_wallet_type";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletType, setWalletTypeState] = useState<WalletType | null>(() => {
    if (typeof window === "undefined") return null;
    return (localStorage.getItem(LS_WALLET_TYPE_KEY) as WalletType | null) ?? null;
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // selectedChain est toujours dérivé de walletType — pas de state séparé
  const selectedChain: ChainId | null = detectChain(walletType);

  const supabase = createClient();

  const setWalletType = useCallback((type: WalletType | null) => {
    setWalletTypeState(type);
    if (typeof window !== "undefined") {
      if (type) {
        localStorage.setItem(LS_WALLET_TYPE_KEY, type);
      } else {
        localStorage.removeItem(LS_WALLET_TYPE_KEY);
      }
    }
  }, []);

  const checkAdmin = useCallback(async () => {
    const admin = await isAdminWallet();
    setIsAdmin(admin);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const address = data.session?.user?.user_metadata?.wallet_address;
      if (address) {
        setWalletAddress(address);
        void checkAdmin();
      } else {
        setWalletType(null);
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const address = session?.user?.user_metadata?.wallet_address;
        if (address) {
          setWalletAddress(address);
          void checkAdmin();
        } else {
          setWalletAddress(null);
          setIsAdmin(false);
          setWalletType(null);
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
        selectedChain,
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
