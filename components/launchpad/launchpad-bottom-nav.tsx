"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Rocket, User, Trophy } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

const NAV_ITEMS = [
  { label: T("Tokens"),      href: "/launchpad",             icon: LayoutGrid },
  { label: T("Leaderboard"), href: "/leaderboard/launchpad", icon: Trophy     },
  { label: T("+ Launch"),    href: "/launchpad/create",      icon: Rocket     },
  { label: T("My tokens"),   href: "/dashboard/launchpad",   icon: User       },
];

export function LaunchpadBottomNav() {
  const [mounted, setMounted] = useState(false);
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const visibleItems = isAuthenticated
    ? NAV_ITEMS
    : NAV_ITEMS.filter(({ href }) => href !== "/dashboard/launchpad");

  return (
    <nav className="fixed inset-x-4 bottom-4 z-40 flex gap-1 p-1.5 md:hidden nav-pill" style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {visibleItems.map(({ label, href, icon: Icon }) => {
        const active =
          href === "/launchpad"
            ? pathname === "/launchpad" ||
              (pathname.startsWith("/launchpad/") &&
                !pathname.startsWith("/launchpad/create") &&
                !pathname.startsWith("/launchpad/coming-soon"))
            : pathname === href || pathname.startsWith(href + "/");

        const isLaunch = href === "/launchpad/create";
        if (isLaunch && !isAuthenticated) {
          return (
            <button
              key={href}
              onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
              className={`flex h-14 flex-1 items-center justify-center rounded-full transition-colors text-muted-foreground hover:text-foreground`}
            >
              <Icon className="size-[26px]" strokeWidth={1.75} />
              <span className="sr-only">{tr(label)}</span>
            </button>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            className={`flex h-14 flex-1 items-center justify-center rounded-full transition-colors ${
              active ? "nav-pill-active text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-[26px]" strokeWidth={active ? 2.25 : 1.75} />
            <span className="sr-only">{tr(label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
