"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { WalletButton } from "@/components/layout/wallet-button";
import { useAuth } from "@/providers/auth-provider";

const PUBLIC_NAV_LINKS = [
  { href: "/launchpad",              label: "Tokens"       },
  { href: "/launchpad/create",       label: "+ Launch"     },
  { href: "/leaderboard/launchpad",  label: "Leaderboard"  },
  { href: "/prediction",             label: "Predictions"  },
];

const AUTH_NAV_LINKS = [
  { href: "/launchpad",              label: "Tokens"       },
  { href: "/launchpad/create",       label: "+ Launch"     },
  { href: "/dashboard/launchpad",    label: "My tokens"    },
  { href: "/leaderboard/launchpad",  label: "Leaderboard"  },
  { href: "/prediction",             label: "Predictions"  },
];

const MOBILE_EXTRA_LINKS: never[] = [];

function isActive(href: string, pathname: string) {
  if (href === "/launchpad") {
    // active sur /launchpad exactement et sur /launchpad/[id] — pas sur /launchpad/create
    return pathname === "/launchpad" ||
      (pathname.startsWith("/launchpad/") &&
        !pathname.startsWith("/launchpad/create") &&
        !pathname.startsWith("/launchpad/coming-soon"));
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function LaunchpadHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { isAuthenticated, walletAddress } = useAuth();
  const NAV_LINKS = isAuthenticated ? AUTH_NAV_LINKS : PUBLIC_NAV_LINKS;

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">

          {/* Logo */}
          <Link href="/launchpad" className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight text-foreground">
            <Image src="/omdot-icon.png" alt="OMdotfun" width={38} height={38} className="logo-bounce drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]" />
            <span>OMdotfun</span>
          </Link>

          {/* Nav desktop */}
          <nav className="hidden items-center gap-1 rounded-2xl bg-muted/70 p-1 text-sm md:flex">
            {NAV_LINKS.map(({ href, label }) => {
              const isLaunch = href === "/launchpad/create";
              if (isLaunch && !isAuthenticated) {
                return (
                  <button
                    key={href}
                    onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
                    className="rounded-xl px-3.5 py-1.5 font-semibold transition-colors hover:text-foreground text-muted-foreground"
                  >
                    {label}
                  </button>
                );
              }
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-xl px-3.5 py-1.5 font-semibold transition-colors hover:text-foreground ${
                    isActive(href, pathname)
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-2">
            <WalletButton />
            <button
              onClick={() => setOpen(true)}
              aria-label="Open navigation menu"
              className="flex size-10 items-center justify-center rounded-2xl bg-muted text-foreground transition-colors hover:bg-muted/70 md:hidden"
            >
              <Menu className="size-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-72 rounded-l-3xl border-l border-border bg-card shadow-xl md:hidden flex flex-col">
            <div className="flex h-16 items-center justify-between px-5">
              <span className="text-lg font-bold tracking-tight text-foreground">Launchpad</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>
            {/* Wallet — only reachable from this menu on mobile */}
            <div className="px-3 pt-3">
              {isAuthenticated && walletAddress ? (
                <button
                  type="button"
                  onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("open-wallet-profile")); }}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3.5 text-left transition-colors hover:bg-muted/70"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="size-2 rounded-full bg-up" />
                    <span className="text-[15px] font-semibold text-foreground">My wallet</span>
                  </span>
                  <span className="font-mono text-[13px] text-muted-foreground">
                    {walletAddress.slice(0, 4)}…{walletAddress.slice(-4)}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("open-wallet-connect")); }}
                  className="btn-primary flex h-12 w-full items-center justify-center rounded-2xl text-[15px]"
                >
                  Connect Wallet
                </button>
              )}
            </div>
            <nav className="flex flex-col gap-1 p-3">
              {NAV_LINKS.map(({ href, label }) => {
                const isLaunch = href === "/launchpad/create";
                if (isLaunch && !isAuthenticated) {
                  return (
                    <button
                      key={href}
                      onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("open-wallet-connect")); }}
                      className="flex items-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground w-full text-left"
                    >
                      {label}
                    </button>
                  );
                }
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition-colors hover:bg-muted ${
                      isActive(href, pathname)
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
              {[...MOBILE_EXTRA_LINKS].map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
