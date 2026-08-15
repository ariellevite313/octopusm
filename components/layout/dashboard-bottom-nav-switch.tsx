"use client";

import { usePathname } from "next/navigation";
import { BottomNavWrapper } from "@/components/layout/bottom-nav-wrapper";
import { LaunchpadBottomNav } from "@/components/launchpad/launchpad-bottom-nav";

export function DashboardBottomNavSwitch() {
  const pathname = usePathname();
  if (pathname === "/dashboard/launchpad" || pathname.startsWith("/dashboard/launchpad/")) {
    return <LaunchpadBottomNav />;
  }
  return <BottomNavWrapper />;
}
