"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Layers, CheckSquare, Users, Rocket } from "lucide-react";

const TABS = [
  { label: "Predictions", href: "/dashboard/predictions", icon: BarChart2 },
  { label: "Pools",       href: "/dashboard/pools",       icon: Layers },
  { label: "Tokens",      href: "/dashboard/launchpad",   icon: Rocket },
  { label: "Tasks",       href: "/dashboard/tasks",       icon: CheckSquare },
  { label: "Referrals",   href: "/dashboard/referrals",   icon: Users },
];

// Note: 5 tabs — kept compact via text-sm. The container uses overflow-x-auto
// so tabs never wrap or clip on narrow desktop screens.

export function DashboardTabs() {
  const pathname = usePathname();

  // Launchpad dashboard is a separate universe — no prediction tabs
  if (pathname === "/dashboard/launchpad" || pathname.startsWith("/dashboard/launchpad/")) {
    return null;
  }

  return (
    <div className="flex border-b border-border overflow-x-auto scrollbar-none">
      {TABS.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Icon className="size-4" strokeWidth={active ? 2.5 : 1.75} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
