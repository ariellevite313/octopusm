"use client";

import { usePathname } from "next/navigation";

/** Masque son contenu sur /dashboard/launchpad (l'identité y est dans la carte). */
export function HideOnLaunchpad({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/dashboard/launchpad" || pathname.startsWith("/dashboard/launchpad/")) return null;
  return <>{children}</>;
}
