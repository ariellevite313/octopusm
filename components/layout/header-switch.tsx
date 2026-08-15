"use client";

import { usePathname } from "next/navigation";
import { Header } from "./header";
import { LaunchpadHeader } from "@/components/launchpad/launchpad-header";

const LAUNCHPAD_PATHS = ["/launchpad", "/dashboard/launchpad"];

export function HeaderSwitch() {
  const pathname = usePathname();
  const isLaunchpad = LAUNCHPAD_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isLaunchpad) return <LaunchpadHeader />;
  return <Header />;
}
