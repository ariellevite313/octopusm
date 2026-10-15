"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, LayoutGrid, MoreHorizontal, X, ExternalLink, Rocket, User, Trophy } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { AppIcon } from "@/components/shared/app-icon";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

const PREDICT_NAV = [
  { label: T("Markets"),     href: "/prediction",              icon: BarChart2,  exact: true  },
  { label: T("Tokens"),      href: "/launchpad",               icon: LayoutGrid, exact: false },
  { label: T("Leaderboard"), href: "/leaderboard/predictions", icon: Trophy,     exact: true  },
];

const LAUNCHPAD_NAV = [
  { label: T("Tokens"),      href: "/launchpad",               icon: LayoutGrid, exact: false },
  { label: T("Leaderboard"), href: "/leaderboard/launchpad",   icon: Trophy,     exact: true  },
  { label: T("Launch"),      href: "/launchpad/create",        icon: Rocket,     exact: true  },
  { label: T("Portfolio"),    href: "/dashboard/launchpad",     icon: User,       exact: false },
];

const CLT_DEXSCREENER = "https://dexscreener.com/solana/egi97rat7zrxrqvvv7edb5tvxzzxwgdh8vwvkgpfzdfc";

const MORE_ITEMS = [
  {
    label: "$CLAWDTRUST",
    description: T("Our partner token on Solana"),
    href: CLT_DEXSCREENER,
    icon: "ti-coin",
    external: true,
  },
  {
    label: T("Support"),
    description: T("Get help from the team"),
    href: "https://t.me/Omdotfun",
    icon: "ti-headset",
    external: true,
  },
  {
    label: T("FAQ"),
    description: T("Frequently asked questions"),
    href: "/faq",
    icon: "ti-help-circle",
    external: false,
  },
  {
    label: T("Tutorial"),
    description: T("Learn how to use OMdotfun"),
    href: "https://t.me/OmdotfunTuto",
    icon: "ti-book",
    external: true,
  },
  {
    label: T("ŌM Policy"),
    description: T("Rules, prohibitions, removals"),
    href: "/policy",
    icon: "ti-shield-check",
    external: false,
  },
  {
    label: T("Privacy Policy"),
    description: T("How we handle your data"),
    href: "/privacy",
    icon: "ti-lock",
    external: false,
  },
];

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tr } = useT();
  // Lock body scroll + close on Escape
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handler);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 transition-opacity duration-200 md:hidden ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] bg-card border-t border-border md:hidden transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle pill */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1.5 w-12 rounded-full bg-muted" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <span className="text-lg font-bold tracking-tight text-foreground">{tr("More")}</span>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label={tr("Close")}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Links */}
        <ul className="px-4 py-3 space-y-2 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          {MORE_ITEMS.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                onClick={onClose}
                className="flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-muted/50 hover:bg-muted transition-colors group"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-foreground">
                  <AppIcon name={item.icon} className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-foreground">{tr(item.label)}</p>
                  <p className="text-xs text-muted-foreground">{tr(item.description)}</p>
                </div>
                {item.external && (
                  <ExternalLink className="size-3.5 text-muted-foreground/50 shrink-0" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function BottomNav() {
  const [mounted, setMounted]       = useState(false);
  const [sheetOpen, setSheetOpen]   = useState(false);
  const { isAuthenticated } = useAuth();
  const { tr } = useT();
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isLaunchpad = pathname === "/" || pathname === "/launchpad" || pathname.startsWith("/launchpad/") || pathname.startsWith("/dashboard/launchpad") || pathname === "/leaderboard/launchpad";
  const navItems = isLaunchpad ? LAUNCHPAD_NAV : PREDICT_NAV;

  return (
    <>
      <MoreSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />

      <nav className="fixed inset-x-4 bottom-4 z-40 flex gap-1 p-1.5 md:hidden nav-pill" style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {navItems.map(({ label, href, icon: Icon, exact }) => {
          // Treat "/" as "/launchpad" for active-state purposes (homepage = launchpad)
          const effectivePath = pathname === "/" ? "/launchpad" : pathname;
          const active = exact
            ? effectivePath === href
            : effectivePath === href || effectivePath.startsWith(href + "/");
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

        <button
          onClick={() => setSheetOpen(true)}
          className="flex h-14 flex-1 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
        >
          <MoreHorizontal className="size-[26px]" strokeWidth={1.75} />
          <span className="sr-only">{tr("More")}</span>
        </button>
      </nav>
    </>
  );
}
