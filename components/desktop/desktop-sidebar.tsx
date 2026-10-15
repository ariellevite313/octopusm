"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutGrid, Trophy, BarChart2, User, Headset, Plus, Wallet, Coins, HelpCircle, BookOpen, ShieldCheck, Lock, Archive } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";

// Barre d'icônes verticale (ordinateur uniquement).

const ITEMS = [
  { href: "/",                       label: "Tokens",      icon: LayoutGrid, match: (p: string) => p === "/" || p === "/launchpad" || (p.startsWith("/launchpad/") && !p.startsWith("/launchpad/create")) },
  { href: "/leaderboard/launchpad",  label: "Leaderboard", icon: Trophy,     match: (p: string) => p.startsWith("/leaderboard") },
  { href: "/prediction",             label: "Predictions", icon: BarChart2,  match: (p: string) => p.startsWith("/prediction") || p.startsWith("/updown") || p.startsWith("/pools") },
  { href: "/dashboard/launchpad",    label: "My tokens",   icon: User,       match: (p: string) => p.startsWith("/dashboard"), auth: true },
];

const EXTRA = [
  { href: "/archive",                    label: "Archive",          icon: Archive,     external: false },
  { href: "https://dexscreener.com/solana/egi97rat7zrxrqvvv7edb5tvxzzxwgdh8vwvkgpfzdfc", label: "$CLAWDTRUST", icon: Coins, external: true },
  { href: "https://t.me/Omdotfun",       label: "Support",          icon: Headset,     external: true  },
  { href: "/faq",                        label: "FAQ",              icon: HelpCircle,  external: false },
  { href: "https://t.me/OmdotfunTuto",   label: "Tutorial",         icon: BookOpen,    external: true  },
  { href: "/policy",                     label: "ŌM Policy",        icon: ShieldCheck, external: false },
  { href: "/privacy",                    label: "Privacy Policy",   icon: Lock,        external: false },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  if (pathname.startsWith("/admin")) return null;

  return (
    <aside className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto scrollbar-none border-r border-border/60 bg-background py-4 lg:flex">
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

      {/* Tout le menu ⋯ en icônes, dans l'angle bas */}
      <div className="mt-auto flex flex-col items-center gap-1">
        <button
          type="button"
          title={isAuthenticated ? "My wallet" : "Connect wallet"}
          aria-label={isAuthenticated ? "My wallet" : "Connect wallet"}
          onClick={() => window.dispatchEvent(new CustomEvent(isAuthenticated ? "open-wallet-profile" : "open-wallet-connect"))}
          className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-muted text-foreground hover:bg-muted/70"
        >
          <Wallet className="size-[20px]" />
        </button>
        {EXTRA.map(({ href, label, icon: Icon, external }) => {
          const cls = `flex size-9 items-center justify-center rounded-xl transition-colors ${
            !external && pathname.startsWith(href) ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }`;
          return external ? (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} className={cls}>
              <Icon className="size-[18px]" strokeWidth={1.75} />
            </a>
          ) : (
            <Link key={href} href={href} title={label} aria-label={label} className={cls}>
              <Icon className="size-[18px]" strokeWidth={1.75} />
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
