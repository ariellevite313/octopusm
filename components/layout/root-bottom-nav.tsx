"use client";

import { usePathname } from "next/navigation";
import { BottomNavWrapper } from "@/components/layout/bottom-nav-wrapper";

// Routes that have their own bottom nav — don't render the global one there
const EXCLUDED_PREFIXES = ["/dashboard", "/launchpad", "/admin"];

export function RootBottomNav() {
  const pathname = usePathname();
  const excluded = EXCLUDED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (excluded) return null;
  return <BottomNavWrapper />;
}
