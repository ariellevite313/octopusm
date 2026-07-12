"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Layers, CheckSquare, Users } from "lucide-react";

const TABS = [
  { label: "Predictions", href: "/dashboard/predictions", icon: BarChart2 },
  { label: "Pools",       href: "/dashboard/pools",       icon: Layers },
  { label: "Tasks",       href: "/dashboard/tasks",       icon: CheckSquare },
  { label: "Referrals",  href: "/dashboard/referrals",   icon: Users },
];

export function DashboardTabs() {
  const pathname = usePathname();

  return (
    <div className="hidden md:flex border-b border-border">
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
