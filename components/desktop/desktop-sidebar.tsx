"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutGrid, Trophy, BarChart2, User, Headset, Plus, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";

// Barre d'icônes verticale (ordinateur uniquement).

const ITEMS = [
  { href: "/",                       label: "Tokens",      icon: LayoutGrid, match: (p: string) => p === "/" || p === "/launchpad" || (p.startsWith("/launchpad/") && !p.startsWith("/launchpad/create")) },
  { href: "/leaderboard/launchpad",  label: "Leaderboard", icon: Trophy,     match: (p: string) => p.startsWith("/leaderboard") },
  { href: "/prediction",             label: "Predictions", icon: BarChart2,  match: (p: string) => p.startsWith("/prediction") || p.startsWith("/updown") || p.startsWith("/pools") },
  { href: "/dashboard/launchpad",    label: "My tokens",   icon: User,       match: (p: string) => p.startsWith("/dashboard"), auth: true },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  if (pathname.startsWith("/admin")) return null;

  return (
    <aside className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col items-center gap-2 border-r border-border/60 bg-background py-4 lg:flex">
      <Link href="/" aria-label="OMdotfun" className="mb-3">
        <Image src="/omdot-icon.png" alt="OMdotfun" width={40} height={40} className="logo-bounce" />
      </Link>

      {ITEMS.filter((i) => !i.auth || isAuthenticated).map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            className={`flex size-11 items-center justify-center rounded-2xl transition-colors ${
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
          </Link>
        );
      })}

      {/* Launch */}
      {isAuthenticated ? (
        <Link href="/launchpad/create" title="Launch a token" aria-label="Launch a token" className="btn-primary mt-2 flex size-11 items-center justify-center rounded-2xl">
          <Plus className="size-6" strokeWidth={2.5} />
        </Link>
      ) : (
        <button
          type="button"
          title="Launch a token"
          aria-label="Launch a token"
          onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
          className="btn-primary mt-2 flex size-11 items-center justify-center rounded-2xl"
        >
          <Plus className="size-6" strokeWidth={2.5} />
        </button>
      )}

      <div className="mt-auto flex flex-col items-center gap-2">
        <button
          type="button"
          title="Menu & wallet"
          aria-label="Open menu and wallet"
          onClick={() => window.dispatchEvent(new CustomEvent("open-main-menu"))}
          className="flex size-11 items-center justify-center rounded-2xl bg-muted text-foreground hover:bg-muted/70"
        >
          <MoreHorizontal className="size-[22px]" />
        </button>
        <a href="https://t.me/Omdotfun" target="_blank" rel="noopener noreferrer" title="Support" aria-label="Support" className="flex size-11 items-center justify-center rounded-2xl text-muted-foreground hover:bg-muted/60 hover:text-foreground">
          <Headset className="size-[22px]" strokeWidth={1.75} />
        </a>
      </div>
    </aside>
  );
}
