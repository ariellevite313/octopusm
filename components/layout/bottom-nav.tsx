"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, TrendingUp, Trophy, LayoutGrid, User } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";

const NAV_ITEMS = [
  { label: "Markets",    href: "/",            icon: BarChart2,   exact: true  },
  { label: "Up/Down",   href: "/updown",       icon: TrendingUp,  exact: false },
  { label: "Top",       href: "/leaderboard",  icon: Trophy,      exact: false },
  { label: "Tokens",    href: "/launchpad",    icon: LayoutGrid,  exact: false, external: true },
  { label: "Account",   href: "/dashboard",    icon: User,        exact: false },
];

export function BottomNav() {
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !isAuthenticated) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t border-border bg-background">
      {NAV_ITEMS.map(({ label, href, icon: Icon, exact, external }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
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
