"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { ComposeModal } from "./compose-modal";

/** « Publier » depuis les pages sans bouton rond (Terminal, classements...) : le menu du fil/launchpad gere le sien. */
export function ComposeLauncher() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = () => {
      if ((window as unknown as { __omCompose?: number }).__omCompose) return; // la page a son propre menu
      if (!isAuthenticated) window.dispatchEvent(new CustomEvent("open-wallet-connect")); else setOpen(true);
    };
    window.addEventListener("open-compose", h);
    return () => window.removeEventListener("open-compose", h);
  }, [isAuthenticated]);
  return open ? <ComposeModal onClose={() => setOpen(false)} onPosted={() => { setOpen(false); router.push("/"); }} /> : null;
}
