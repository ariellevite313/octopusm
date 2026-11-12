"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { ChillComposer } from "@/components/social/chill";

/** Ouvre « Chill your bag » depuis n'importe quelle page : window.dispatchEvent(new Event("open-chill")). */
export function ChillLauncher() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = () => { if (!isAuthenticated) window.dispatchEvent(new CustomEvent("open-wallet-connect")); else setOpen(true); };
    window.addEventListener("open-chill", h);
    return () => window.removeEventListener("open-chill", h);
  }, [isAuthenticated]);
  return open ? <ChillComposer onClose={() => setOpen(false)} /> : null;
}
