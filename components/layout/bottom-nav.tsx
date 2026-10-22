"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, LayoutGrid, MessageSquare, Trophy, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { getWalletProfile } from "@/services/wallet-service";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

/**
 * Menu du bas, identique dans les deux sections (mêmes places) :
 *   1. Feed (accueil) · 2. accueil de la section · 3. classement · 4. autre section · 5. profil
 */
type Section = "launchpad" | "predict";
type Item = { label: string; href: string; icon: typeof BarChart2; active: (p: string) => boolean };

const isLaunchpadPath = (p: string) =>
  p === "/launchpad" || p.startsWith("/launchpad/") || p.startsWith("/dashboard/launchpad") || p === "/leaderboard/launchpad";
const isPredictPath = (p: string) =>
  p === "/prediction" || p.startsWith("/prediction/") || p.startsWith("/pools") || p.startsWith("/crypto") ||
  p.startsWith("/updown") || p === "/leaderboard/predictions" || p.startsWith("/archive") || p.startsWith("/dashboard/predictions");

const TOKENS: Item = { label: T("Tokens"), href: "/launchpad", icon: LayoutGrid, active: (p) => p === "/launchpad" || (p.startsWith("/launchpad/") && !p.startsWith("/launchpad/create")) };
const MARKETS: Item = { label: T("Markets"), href: "/prediction", icon: BarChart2, active: (p) => p === "/prediction" };
const FEED: Item = { label: T("Feed"), href: "/", icon: MessageSquare, active: (p) => p === "/" || p === "/feed" || p.startsWith("/post/") };

const NAV: Record<Section, Item[]> = {
  predict: [FEED, MARKETS, { label: T("Leaderboard"), href: "/leaderboard/predictions", icon: Trophy, active: (p) => p === "/leaderboard/predictions" }, TOKENS],
  launchpad: [FEED, TOKENS, { label: T("Leaderboard"), href: "/leaderboard/launchpad", icon: Trophy, active: (p) => p === "/leaderboard/launchpad" }, MARKETS],
};

const KEY = "om_nav_section";

export function BottomNav() {
  const [mounted, setMounted] = useState(false);
  const [last, setLast] = useState<Section>("launchpad");
  const { isAuthenticated, walletAddress } = useAuth();
  const { tr } = useT();
  const pathname = usePathname();
  const { data: me } = useQuery({
    queryKey: ["wallet-profile", walletAddress],
    queryFn: () => getWalletProfile(walletAddress ?? ""),
    staleTime: 60_000,
    enabled: !!walletAddress,
  });

  useEffect(() => {
    setMounted(true);
    try { const v = localStorage.getItem(KEY); if (v === "launchpad" || v === "predict") setLast(v); } catch { /* stockage indisponible */ }
  }, []);

  // Section courante ; sur les pages communes (Feed, profil, FAQ…) on garde la dernière section visitée
  const section: Section = isLaunchpadPath(pathname) ? "launchpad" : isPredictPath(pathname) ? "predict" : last;
  useEffect(() => {
    if (section !== last) setLast(section);
    try { localStorage.setItem(KEY, section); } catch { /* stockage indisponible */ }
  }, [section, last]);

  if (!mounted) return null;

  const cls = (active: boolean) =>
    `flex h-14 flex-1 items-center justify-center rounded-full transition-colors ${active ? "nav-pill-active text-foreground" : "text-muted-foreground hover:text-foreground"}`;
  const profileActive = !!walletAddress && pathname.toLowerCase() === `/profile/${walletAddress.toLowerCase()}`;

  return (
    <nav className="fixed inset-x-4 bottom-4 z-40 flex gap-1 p-1.5 md:hidden nav-pill" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {NAV[section].map(({ label, href, icon: Icon, active }) => {
        const on = active(pathname);
        return (
          <Link key={href} href={href} className={cls(on)}>
            <Icon className="size-[26px]" strokeWidth={on ? 2.25 : 1.75} />
            <span className="sr-only">{tr(label)}</span>
          </Link>
        );
      })}

      {isAuthenticated && walletAddress ? (
        <Link href={`/profile/${walletAddress}`} className={cls(profileActive)}>
          {me?.avatar_src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatar_src} alt="" className={`size-8 rounded-full object-cover ${profileActive ? "ring-2 ring-foreground" : ""}`} />
          ) : (
            <User className="size-[26px]" strokeWidth={profileActive ? 2.25 : 1.75} />
          )}
          <span className="sr-only">{tr("Profile")}</span>
        </Link>
      ) : (
        <button onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} className={cls(false)}>
          <User className="size-[26px]" strokeWidth={1.75} />
          <span className="sr-only">{tr("Profile")}</span>
        </button>
      )}
    </nav>
  );
}
