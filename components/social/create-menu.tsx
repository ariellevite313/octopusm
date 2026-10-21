"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, PenLine, Plus, Rocket, X } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { ComposeModal } from "./compose-modal";
import { CreatePoolModal } from "@/components/pools/create-pool-modal";
import type { FeedPost } from "@/lib/social/posts";

/** Bouton « + » rond : Publier, Lancer un pool, Lancer un token. */
export function CreateMenu({ onPosted }: { onPosted: (p: FeedPost) => void }) {
  const { tr } = useT();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [compose, setCompose] = useState(false);
  const [pool, setPool] = useState(false);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  function go(kind: "post" | "pool" | "token") {
    setOpen(false);
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    if (kind === "post") setCompose(true);
    else if (kind === "pool") setPool(true);
    else router.push("/launchpad/create");
  }

  const items = [
    { k: "post" as const, icon: PenLine, title: tr("Post"), sub: tr("Text, images or GIF") },
    { k: "pool" as const, icon: BarChart3, title: tr("Launch a pool"), sub: tr("Create a prediction pool") },
    { k: "token" as const, icon: Rocket, title: tr("Launch a token"), sub: tr("Solana or Arc") },
  ];

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={tr(open ? "Close" : "Create")}
        className="fixed bottom-28 right-4 z-[55] flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-[0_8px_24px_-6px_rgba(247,107,16,.6)] transition-transform active:scale-95 md:bottom-8 md:right-8"
      >
        {open ? <X className="size-7" strokeWidth={2.4} /> : <Plus className="size-8" strokeWidth={2.4} />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[54] bg-black/60" onClick={() => setOpen(false)} aria-hidden />
          <div className="fixed bottom-48 left-4 right-4 z-[55] mx-auto max-w-sm rounded-[28px] border border-border bg-card p-2 shadow-2xl md:bottom-28 md:left-auto md:right-8 md:mx-0">
            {items.map(({ k, icon: Icon, title, sub }) => (
              <button key={k} onClick={() => go(k)} className="flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left hover:bg-muted">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="size-5" /></span>
                <span>
                  <span className="block text-base font-bold text-foreground">{title}</span>
                  <span className="block text-xs text-muted-foreground">{sub}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {compose && <ComposeModal onClose={() => setCompose(false)} onPosted={onPosted} />}
      {pool && (
        <CreatePoolModal
          onClose={() => setPool(false)}
          onCreated={(m) => { setPool(false); router.push(`/pools/${m.slug ?? m.id}`); }}
        />
      )}
    </>
  );
}
