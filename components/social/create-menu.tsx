"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, FileText, Gem, PenLine, Rocket, X } from "lucide-react";
import { ChillComposer } from "./chill";
import { PawIcon } from "@/components/shared/paw-icon";
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
  const [chill, setChill] = useState(false);

  // Bouton « Publier » de la barre latérale (ordinateur)
  useEffect(() => {
    const h = () => { if (!isAuthenticated) window.dispatchEvent(new CustomEvent("open-wallet-connect")); else setCompose(true); };
    window.addEventListener("open-compose", h);
    return () => window.removeEventListener("open-compose", h);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  function go(kind: "post" | "article" | "bag" | "pool" | "token") {
    setOpen(false);
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    if (kind === "post") setCompose(true);
    else if (kind === "article") router.push("/article/new");
    else if (kind === "bag") setChill(true);
    else if (kind === "pool") setPool(true);
    else router.push("/launchpad/create");
  }

  const items = [
    { k: "post" as const, icon: PenLine, title: tr("Post"), sub: tr("Text, images or GIF") },
    { k: "article" as const, icon: FileText, title: tr("Article"), sub: tr("A long read with a cover and images") },
    { k: "bag" as const, icon: Gem, title: tr("Chill your bag"), sub: tr("Show a token you hold, earn 40% of the fees") },
    { k: "pool" as const, icon: BarChart3, title: tr("Launch a pool"), sub: tr("Create a prediction pool") },
    { k: "token" as const, icon: Rocket, title: tr("Launch a token"), sub: tr("Solana or Arc") },
  ];

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={tr(open ? "Close" : "Create")}
        className="fixed bottom-28 right-4 z-[48] flex size-14 items-center justify-center rounded-full border border-black/10 bg-white/35 text-foreground shadow-[0_8px_32px_rgba(0,0,0,0.28),inset_0_1px_1px_rgba(255,255,255,0.65),inset_0_-2px_6px_rgba(255,255,255,0.12)] backdrop-blur-[18px] backdrop-saturate-150 transition-transform active:scale-95 dark:border-white/30 dark:bg-white/10 md:bottom-8 md:right-8"
      >
        {open ? <X className="size-7" strokeWidth={2.4} /> : <PawIcon glass className="size-[30px]" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[46] bg-black/60" onClick={() => setOpen(false)} aria-hidden />
          <div className="fixed bottom-48 left-4 right-4 z-[47] mx-auto max-w-sm rounded-[28px] border border-border bg-card p-2 shadow-2xl md:bottom-28 md:left-auto md:right-8 md:mx-0">
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

      {chill && <ChillComposer onClose={() => setChill(false)} />}
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
