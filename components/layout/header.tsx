"use client";

import { NotificationMenuLink, useUnreadNotifications } from "@/components/social/notification-bell";
import { useEffect, useState } from "react";
import { SearchButton } from "@/components/social/search-overlay";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { WalletButton } from "./wallet-button";
import { MenuFooter, MenuSettingsPanel } from "@/components/layout/menu-settings";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

const NAV_LINKS = [
  { href: "/",                        label: T("Feed"),        badge: undefined, disabled: false },
  { href: "/prediction",              label: T("Markets"),     badge: undefined, disabled: false },
  { href: "/leaderboard/predictions", label: T("Leaderboard"), badge: undefined, disabled: false },
  { href: "/launchpad",               label: T("Launchpad"),   badge: undefined, disabled: false },
  { href: "/live",                    label: T("Live scores"), badge: undefined, disabled: false },
] satisfies { href: string; label: string; badge?: string; disabled: boolean; external?: boolean }[];

function isActive(href: string, pathname: string) {
  // "/" est le fil
  if (href === "/") return pathname === "/" || pathname.startsWith("/feed") || pathname.startsWith("/post/");
  if (href === "/launchpad") return pathname === "/launchpad" || pathname.startsWith("/launchpad/");
  return pathname === href || pathname.startsWith(href + "/");
}

export function Header() {
  const [open, setOpenRaw] = useState(false);
  const [settings, setSettings] = useState(false);
  const setOpen = (v: boolean) => { setOpenRaw(v); if (!v) setSettings(false); };
  const unread = useUnreadNotifications();

  // The desktop sidebar's "⋯" button opens this same menu
  useEffect(() => {
    const openMenu = () => setOpen(true);
    window.addEventListener("open-main-menu", openMenu);
    return () => window.removeEventListener("open-main-menu", openMenu);
  }, []);
  const pathname = usePathname();
  const { isAuthenticated, walletAddress } = useAuth();
  const { tr } = useT();
  const inLaunchpad = pathname.startsWith("/launchpad") || pathname.startsWith("/dashboard") || pathname.startsWith("/leaderboard/launchpad");
  type NavLink = { href: string; label: string; badge?: string; disabled: boolean; external?: boolean };
  const links: NavLink[] = (NAV_LINKS as NavLink[]).map((l) => (l.label === T("Leaderboard") && inLaunchpad ? { ...l, href: "/leaderboard/launchpad" } : l));

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/95 lg:hidden">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight text-foreground lg:invisible">
            <BrandLogo size={38} />
            <span className="sr-only">OMdotfun</span>
          </Link>

          <nav className="hidden items-center gap-1 rounded-2xl bg-muted/70 p-1 text-sm md:flex lg:hidden">
            {links.map(({ href, label, badge, disabled, external }) =>
              disabled ? (
                <span
                  key={label}
                  className="flex items-center gap-1.5 cursor-not-allowed text-muted-foreground/50 select-none"
                >
                  {tr(label)}
                  {badge && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      {tr(badge)}
                    </span>
                  )}
                </span>
              ) : (
                <Link
                  key={href}
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-semibold transition-colors hover:text-foreground ${
                    !external && isActive(href, pathname)
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  {tr(label)}
                  
                </Link>
              )
            )}
          </nav>

          <div className="flex items-center gap-2">
            <SearchButton />
            <WalletButton />
            <button
              onClick={() => setOpen(true)}
              aria-label={tr("Open navigation menu")}
              className="flex size-10 items-center justify-center text-foreground transition-opacity hover:opacity-70"
            >
              <span aria-hidden className="relative flex w-6 flex-col gap-[6px]"><span className="h-[3px] w-full rounded-full bg-current" /><span className="h-[3px] w-full rounded-full bg-current" />
                {unread > 0 && <span className="absolute -right-1.5 -top-1.5 size-2.5 rounded-full bg-down ring-2 ring-background" />}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-[60] w-72 rounded-l-3xl border-l border-border bg-card shadow-xl flex flex-col">
            {settings ? <MenuSettingsPanel onBack={() => setSettings(false)} onClose={() => setOpen(false)} /> : (<>
            <div className="flex h-16 items-center justify-between px-5">
              <span className="text-lg font-bold tracking-tight text-foreground">{tr("Menu")}</span>
              <button
                onClick={() => setOpen(false)}
                aria-label={tr("Close menu")}
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
                    <span className="text-[15px] font-semibold text-foreground">{tr("My wallet")}</span>
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
                  {tr("Connect Wallet")}
                </button>
              )}
            </div>
            <nav className="flex min-h-0 flex-col gap-1 overflow-y-auto p-3">
              <NotificationMenuLink active={pathname.startsWith("/notifications")} onClick={() => setOpen(false)} />
              {links.map(({ href, label, badge, disabled, external }) =>
                disabled ? (
                  <span
                    key={label}
                    className="flex items-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-semibold text-muted-foreground/50 cursor-not-allowed select-none"
                  >
                    {tr(label)}
                    {badge && (
                      <span className="text-[9px] font-normal text-muted-foreground/60">
                        {tr(badge).toLowerCase()}
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
                    className={`flex items-center justify-between rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition-colors hover:bg-muted hover:text-foreground ${
                      !external && isActive(href, pathname)
                        ? "text-foreground bg-muted"
                        : "text-muted-foreground"
                    }`}
                  >
                    {tr(label)}
                    
                  </Link>
                )
              )}
              {isAuthenticated && (
                <Link
                  href="/dashboard/launchpad"
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition-colors hover:bg-muted hover:text-foreground ${isActive("/dashboard/launchpad", pathname) ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                >
                  {tr("My tokens")}
                </Link>
              )}
            </nav>
            <div className="mt-auto"><MenuFooter onSettings={() => setSettings(true)} /></div>
            </>)}
          </div>
        </>
      )}
    </>
  );
}
