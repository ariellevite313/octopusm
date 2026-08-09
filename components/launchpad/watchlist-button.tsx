"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";

type Props = { tokenId: string };

export function WatchlistButton({ tokenId }: Props) {
  const { walletAddress } = useAuth();
  const [watching, setWatching] = useState(false);
  const [loading, setLoading]   = useState(false);

  // Check current watchlist status
  useEffect(() => {
    if (!walletAddress) return;
    fetch(`/api/launchpad/${tokenId}/watchlist?wallet=${encodeURIComponent(walletAddress)}`)
      .then(r => r.json())
      .then((d: { watching?: boolean }) => setWatching(d.watching ?? false))
      .catch(() => {});
  }, [tokenId, walletAddress]);

  async function toggle() {
    if (!walletAddress) { toast.error("Connect your wallet first"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/watchlist`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ wallet: walletAddress }),
      });
      const d = await res.json() as { watching?: boolean };
      setWatching(d.watching ?? !watching);
      toast.success(d.watching ? "Added to watchlist" : "Removed from watchlist");
    } catch {
      toast.error("Failed to update watchlist");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
        watching
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
      }`}
    >
      {watching ? <BellOff className="size-4" /> : <Bell className="size-4" />}
      {watching ? "Remove from watchlist" : "Add to watchlist"}
    </button>
  );
}
