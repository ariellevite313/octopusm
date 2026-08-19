"use client";

import { usePathname } from "next/navigation";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";

type Props = { totalOcto: number; size?: number };

/**
 * OctoBadge wrapper that hides on launchpad dashboard routes.
 * OCTO is a prediction-market concept — no cross-contamination in launchpad.
 */
export function OctoBadgeSection({ totalOcto, size }: Props) {
  const pathname = usePathname();
  if (pathname === "/dashboard/launchpad" || pathname.startsWith("/dashboard/launchpad/")) {
    return null;
  }
  return <OctoBadge totalOcto={totalOcto} size={size} />;
}
