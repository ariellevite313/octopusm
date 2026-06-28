/**
 * useWalletBalances
 *
 * Fetches SOL / USDC / ClawdTrust balances for the connected wallet.
 * - Instantly returns a cached snapshot (< 20 s old) so the UI is never blank.
 * - Races all entries in SOLANA_MAINNET_RPC_URLS — first success wins, no 429
 *   cascade visible to the user.
 * - Exposes a `refresh()` function for the manual refresh button.
 *
 * Usage:
 *   const { snapshot, isLoading, isRefreshing, error, refresh } = useWalletBalances(walletAddress);
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchSolanaWalletBalanceSnapshot,
  hasFreshCachedWalletSnapshot,
  readCachedWalletSnapshot,
  type SolanaWalletBalanceSnapshot,
} from "@/components/octopus-market/solana-wallet";

export type WalletBalancesState = {
  /** Latest snapshot — may be a cached value while a fresh fetch is in-flight */
  snapshot: SolanaWalletBalanceSnapshot | null;
  /** True only on the very first fetch (no cached data yet) */
  isLoading: boolean;
  /** True when a refresh is in-flight and we already have cached data to show */
  isRefreshing: boolean;
  /** Last error message, cleared on next successful fetch */
  error: string | null;
  /** Trigger a manual refresh (ignores cache freshness) */
  refresh: () => void;
};

export function useWalletBalances(walletAddress: string | null): WalletBalancesState {
  const [snapshot, setSnapshot] = useState<SolanaWalletBalanceSnapshot | null>(() =>
    walletAddress ? readCachedWalletSnapshot(walletAddress) : null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monotonic counter — lets us discard stale in-flight results
  const fetchIdRef = useRef(0);

  const fetchBalances = useCallback(
    async (address: string, force = false) => {
      // Skip if we already have a fresh snapshot and this is not a forced refresh
      if (!force && hasFreshCachedWalletSnapshot(address)) {
        const cached = readCachedWalletSnapshot(address);
        if (cached) {
          setSnapshot(cached);
          return;
        }
      }

      const fetchId = ++fetchIdRef.current;
      const hasCached = Boolean(readCachedWalletSnapshot(address));

      // Show a spinner: full-screen loader if cold start, subtle spinner if refreshing
      if (hasCached) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const result = await fetchSolanaWalletBalanceSnapshot(address);

        // Discard if a newer fetch has started since we launched this one
        if (fetchIdRef.current !== fetchId) return;

        setSnapshot(result);
      } catch (err) {
        if (fetchIdRef.current !== fetchId) return;
        setError(err instanceof Error ? err.message : "Balance sync failed");
      } finally {
        if (fetchIdRef.current === fetchId) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    []
  );

  // Fetch when wallet connects or changes
  useEffect(() => {
    if (!walletAddress) {
      setSnapshot(null);
      setIsLoading(false);
      setIsRefreshing(false);
      setError(null);
      fetchIdRef.current++; // Cancel any in-flight fetch
      return;
    }

    // Seed the UI instantly with the cached value (may be stale — fetch runs below)
    const cached = readCachedWalletSnapshot(walletAddress);
    if (cached) setSnapshot(cached);

    void fetchBalances(walletAddress, false);
  }, [walletAddress, fetchBalances]);

  const refresh = useCallback(() => {
    if (!walletAddress) return;
    void fetchBalances(walletAddress, true);
  }, [walletAddress, fetchBalances]);

  return { snapshot, isLoading, isRefreshing, error, refresh };
}
