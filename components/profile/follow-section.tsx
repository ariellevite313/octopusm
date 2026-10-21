"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

/** Compteurs abonnés/abonnements + bouton Suivre (masqué sur son propre profil). */
export function FollowSection({ wallet }: { wallet: string }) {
  const { tr } = useT();
  const { isAuthenticated, walletAddress } = useAuth();
  const [stats, setStats] = useState({ followers: 0, following: 0, isFollowing: false });
  const [busy, setBusy] = useState(false);

  const isMe = !!walletAddress && walletAddress.toLowerCase() === wallet.toLowerCase();

  useEffect(() => {
    let alive = true;
    fetch(`/api/follow?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (alive && !d.error) setStats(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [wallet, isAuthenticated]);

  async function toggle() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    setBusy(true);
    const next = !stats.isFollowing;
    try {
      const res = await fetch("/api/follow", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      if (!res.ok) throw new Error();
      setStats(s => ({ ...s, isFollowing: next, followers: Math.max(0, s.followers + (next ? 1 : -1)) }));
    } catch {
      toast.error(tr("Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px]">
      <span className="num"><span className="font-bold text-foreground">{stats.followers}</span> <span className="text-muted-foreground">{tr("Followers")}</span></span>
      <span className="num"><span className="font-bold text-foreground">{stats.following}</span> <span className="text-muted-foreground">{tr("Following")}</span></span>
      {!isMe && (
        <button
          onClick={toggle}
          disabled={busy}
          className={`ml-auto rounded-full px-5 py-1.5 text-[14px] font-bold transition-colors disabled:opacity-60 ${
            stats.isFollowing ? "border border-border text-foreground hover:bg-muted" : "bg-foreground text-background hover:opacity-90"
          }`}
        >
          {stats.isFollowing ? tr("Following") : tr("Follow")}
        </button>
      )}
    </div>
  );
}
