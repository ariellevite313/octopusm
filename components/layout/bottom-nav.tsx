"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Layers, CheckSquare, Users } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";

const NAV_ITEMS = [
  { label: "Predictions", href: "/dashboard/predictions", icon: BarChart2 },
  { label: "Pools",       href: "/dashboard/pools",       icon: Layers },
  { label: "Tasks",       href: "/dashboard/tasks",       icon: CheckSquare },
  { label: "Referrals",  href: "/dashboard/referrals",   icon: Users },
];

export function BottomNav() {
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !isAuthenticated) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t border-border bg-background">
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${
              active
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-5" strokeWidth={active ? 2.5 : 1.75} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
