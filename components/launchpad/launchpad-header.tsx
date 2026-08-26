"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, Trophy } from "lucide-react";
import { WalletButton } from "@/components/layout/wallet-button";

const NAV_LINKS = [
  { href: "/launchpad",           label: "Tokens" },
  { href: "/launchpad/create",    label: "+ Launch" },
  { href: "/dashboard/launchpad", label: "My tokens" },
];

const MOBILE_EXTRA_LINKS = [
  { href: "/leaderboard", label: "Creator Leaderboard", icon: Trophy },
];

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

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">

          {/* Logo */}
          <Link href="/launchpad" className="flex items-center gap-2 font-semibold text-foreground">
            <Image src="/octomarket-logo.png" alt="OMdotfun" width={40} height={40} className="rounded-xl" />
            <span>OMdotfun</span>
          </Link>

          {/* Nav desktop */}
          <nav className="hidden items-center gap-6 text-sm md:flex">
            {/* Back link */}
            <Link
              href="/"
              className="flex items-center gap-1 text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground border-r border-border pr-6"
            >
              ← Predictions
            </Link>

            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`transition-colors hover:text-foreground ${
                  isActive(href, pathname)
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-2">
            <WalletButton />
            <button
              onClick={() => setOpen(true)}
              aria-label="Open navigation menu"
              className="flex size-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted md:hidden"
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
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-72 bg-card shadow-xl md:hidden flex flex-col">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="text-sm font-semibold text-foreground">Launchpad</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-3">
              {/* Back */}
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs text-muted-foreground/50 hover:text-muted-foreground border-b border-border mb-1 transition-colors"
              >
                ← Predictions
              </Link>
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors hover:bg-muted ${
                    isActive(href, pathname)
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </Link>
              ))}
              {[...MOBILE_EXTRA_LINKS].map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
