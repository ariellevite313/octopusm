"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";

type FollowInfo = { followers: number; following: number; is_following: boolean };

function useFollow(wallet: string) {
  return useQuery<FollowInfo>({
    queryKey: ["follow", wallet],
    queryFn: async () => {
      const r = await fetch(`/api/follow?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" });
      return r.json();
    },
    staleTime: 30_000,
  });
}

export function useIsMine(wallet: string) {
  const { walletAddress } = useAuth();
  return !!walletAddress && walletAddress.toLowerCase() === wallet.toLowerCase();
}

export function FollowButton({ wallet }: { wallet: string }) {
  const { tr } = useT();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const mine = useIsMine(wallet);
  const { data } = useFollow(wallet);
  const [busy, setBusy] = useState(false);
  if (mine) return null;

  async function toggle() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    setBusy(true);
    const r = await fetch("/api/follow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(tr(j.error ?? "Something went wrong")); return; }
    qc.setQueryData<FollowInfo>(["follow", wallet], (old) => ({
      followers: j.followers,
      following: old?.following ?? 0,
      is_following: j.is_following,
    }));
  }

  const on = !!data?.is_following;
  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
        on ? "border border-border text-foreground hover:bg-muted" : "bg-foreground text-background hover:opacity-90"
      }`}
    >
      {on ? tr("Following") : tr("Follow")}
    </button>
  );
}

export function FollowCounts({ wallet }: { wallet: string }) {
  const { tr } = useT();
  const { data } = useFollow(wallet);
  return (
    <>
      <span><span className="font-bold text-foreground">{data?.followers ?? 0}</span> <span className="text-muted-foreground">{tr("Followers")}</span></span>
      <span><span className="font-bold text-foreground">{data?.following ?? 0}</span> <span className="text-muted-foreground">{tr("Following")}</span></span>
    </>
  );
}

/** Petit bouton icône (sans texte) pour changer la bannière, visible sur son propre profil. */
export function BannerCamera({ wallet }: { wallet: string }) {
  const { tr } = useT();
  const router = useRouter();
  const mine = useIsMine(wallet);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!mine) return null;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (ref.current) ref.current.value = "";
    if (!f) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch("/api/profile/banner", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(tr(j.error ?? "Something went wrong")); return; }
    router.refresh();
  }

  return (
    <>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onFile} />
      <button
        onClick={() => ref.current?.click()}
        aria-label={tr("Change banner")}
        className="absolute bottom-3 right-3 z-20 flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition-colors hover:bg-black/75"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
      </button>
    </>
  );
}
