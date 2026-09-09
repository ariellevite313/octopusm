"use client";

/**
 * PoolRecoveryPrompt — shown to the creator when pool_address is null
 * but the token status is already "active".
 *
 * Calls /api/launchpad/[id]/check-pool which probes the chain.
 * If found → reloads the page so the swap widget appears.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  tokenId:       string;
  walletAddress: string;
};

export function PoolRecoveryPrompt({ tokenId, walletAddress }: Props) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/check-pool`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walletAddress }),
      });
      const data = await res.json() as { found?: boolean; alreadyActive?: boolean; poolAddress?: string };
      if (data.found) {
        // Pool found on-chain — reload so page.tsx gets fresh data with pool_address
        router.refresh();
      } else {
        setNotFound(true);
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-dashed border-orange-500/40 bg-orange-500/5 px-5 py-6 text-center space-y-3">
      <p className="text-sm font-semibold text-foreground">Pool address not found</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Your token is active but the pool address wasn&apos;t saved. Click below to search for it on-chain.
      </p>
      {notFound && (
        <p className="text-xs text-red-400">
          Pool not found on-chain yet. Wait a few seconds and try again.
        </p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={() => void handleCheck()}
        disabled={checking}
        className="inline-flex items-center gap-2 rounded-full bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white text-[13px] font-semibold px-5 py-2.5 transition-colors"
      >
        {checking && <Loader2 className="size-3.5 animate-spin" />}
        {checking ? "Searching…" : "Find my pool"}
      </button>
    </div>
  );
}
