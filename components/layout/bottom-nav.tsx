"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, LayoutGrid, MoreHorizontal, X, ExternalLink } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";

const NAV_ITEMS = [
  { label: "Markets",  href: "/",           icon: BarChart2,  exact: true  },
  { label: "Tokens",   href: "/launchpad",   icon: LayoutGrid, exact: false },
];

const CLT_DEXSCREENER = "https://dexscreener.com/solana/egi97rat7zrxrqvvv7edb5tvxzzxwgdh8vwvkgpfzdfc";

const MORE_ITEMS = [
  {
    label: "$CLAWDTRUST",
    description: "Our partner token on Solana",
    href: CLT_DEXSCREENER,
    icon: "ti-coin",
    external: true,
  },
  {
    label: "Support",
    description: "Get help from the team",
    href: "https://t.me/Omdotfun",
    icon: "ti-headset",
    external: true,
  },
  {
    label: "FAQ",
    description: "Frequently asked questions",
    href: "https://x.com/omdotfun",
    icon: "ti-help-circle",
    external: true,
  },
  {
    label: "Tutorial",
    description: "Learn how to use OMdotfun",
    href: "https://t.me/OmdotfunTuto",
    icon: "ti-book",
    external: true,
  },
];

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-background border-t border-border md:hidden transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle pill */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-1 pb-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">More</span>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Links */}
        <ul className="px-3 py-3 space-y-1 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          {MORE_ITEMS.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                onClick={onClose}
                className="flex items-center gap-4 px-3 py-3.5 rounded-xl hover:bg-muted/60 transition-colors group"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  <i className={`ti ${item.icon} text-lg`} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
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
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !isAuthenticated) return null;

  return (
    <>
      <MoreSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t border-border bg-background">
        {NAV_ITEMS.map(({ label, href, icon: Icon, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-5" strokeWidth={active ? 2.5 : 1.75} />
              <span>{label}</span>
            </Link>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <MoreHorizontal className="size-5" strokeWidth={1.75} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
