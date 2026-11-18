"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ShareSheet, TOKEN_PERKS } from "@/components/shared/share-sheet";

/** Partage d'un profil : carte des gains (même style que la carte de trade) vers X, Telegram, WhatsApp, Facebook… */
export function ProfileShareSheet({ wallet, name, open, onClose }: { wallet: string; name: string; open: boolean; onClose: () => void }) {
  const { tr } = useT();
  const w = encodeURIComponent(wallet);
  return (
    <ShareSheet
      open={open}
      onClose={onClose}
      portrait
      fileName="omdot-gains.png"
      images={[`/api/og/profile/${w}`]}
      url={`/share/profile/${w}`}
      text={tr("{name}'s gains on OMdotfun", { name })}
      perks={TOKEN_PERKS}
    />
  );
}

export function ProfileShareButton({ wallet, name }: { wallet: string; name: string }) {
  const { tr } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={tr("Share profile")} title={tr("Share profile")}
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Share2 className="size-[18px]" />
      </button>
      <ProfileShareSheet wallet={wallet} name={name} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
