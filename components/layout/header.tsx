"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { WalletButton } from "./wallet-button";

const NAV_LINKS = [
  { href: "/",                        label: "Markets",     badge: undefined, disabled: false },
  { href: "/leaderboard/predictions", label: "Leaderboard", badge: undefined, disabled: false },
  { href: "/launchpad",               label: "Launchpad",   badge: undefined, disabled: false },
  { href: "/archive",                 label: "Archive",     badge: undefined, disabled: false },
] satisfies { href: string; label: string; badge?: string; disabled: boolean; external?: boolean }[];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
            <Image src="/octomarket-logo.png" alt="OMdotfun" width={40} height={40} className="rounded-xl" />
            <span>OMdotfun</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm md:flex">
            {NAV_LINKS.map(({ href, label, badge, disabled, external }) =>
              disabled ? (
                <span
                  key={label}
                  className="flex items-center gap-1.5 cursor-not-allowed text-muted-foreground/50 select-none"
                >
                  {label}
                  {badge && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      {badge}
                    </span>
                  )}
                </span>
              ) : (
                <Link
                  key={href}
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  className={`flex items-center gap-1.5 transition-colors hover:text-foreground ${
                    !external && isActive(href, pathname)
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {label}
                  {external && <span className="text-[10px] opacity-40">↗</span>}
                </Link>
              )
            )}
          </nav>

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

      {/* Mobile nav drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-72 bg-card shadow-xl md:hidden flex flex-col">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="text-sm font-semibold text-foreground">Menu</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-3">
              {NAV_LINKS.map(({ href, label, badge, disabled, external }) =>
                disabled ? (
                  <span
                    key={label}
                    className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground/50 cursor-not-allowed select-none"
                  >
                    {label}
                    {badge && (
                      <span className="text-[9px] font-normal text-muted-foreground/60">
                        {badge.toLowerCase()}
                      </span>
                    )}
                  </span>
                ) : (
                  <Link
                    key={href}
                    href={href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground ${
                      !external && isActive(href, pathname)
                        ? "text-foreground bg-muted"
                        : "text-muted-foreground"
                    }`}
                  >
                    {label}
                    {external && <span className="text-xs opacity-30">↗</span>}
                  </Link>
                )
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
