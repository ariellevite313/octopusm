"use client";

import { NotificationBell } from "@/components/social/notification-bell";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, Trophy, BarChart2, User, MessageSquare, Radio, Plug, Bot, Headset, Plus, Wallet, Coins, HelpCircle, BookOpen, ShieldCheck, Lock, Archive, MoreHorizontal, ExternalLink, PenLine, Rocket, Award } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { LanguageSelectRail } from "@/components/shared/language-select";
import { ThemeSwitchRail } from "@/components/shared/theme-switch";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

// Barre d'icônes verticale (ordinateur uniquement).

// Section prédiction : marchés, Up/Down, pools et leur leaderboard
const isPredictSection = (p: string) =>
  p.startsWith("/prediction") || p.startsWith("/updown") || p.startsWith("/pools") || p.startsWith("/crypto") || p.startsWith("/leaderboard/predictions");

// Section fil : barre élargie avec les libellés sur grand écran
const isFeedSection = (p: string) => p === "/" || p.startsWith("/feed") || p.startsWith("/post/") || p.startsWith("/notifications");

function items(pathname: string) {
  const predict = isPredictSection(pathname);
  return [
    { href: "/hackathon",              label: T("Hackathon"),   icon: Award,      match: (p: string) => p.startsWith("/hackathon") },
    { href: "/",                       label: T("Feed"),        icon: MessageSquare, match: (p: string) => p === "/" || p.startsWith("/feed") || p.startsWith("/post/") },
    { href: "/launchpad",              label: T("Tokens"),      icon: LayoutGrid, match: (p: string) => p === "/launchpad" || (p.startsWith("/launchpad/") && !p.startsWith("/launchpad/create")) },
    // Le trophée ouvre le leaderboard de la section en cours (comme sur téléphone)
    predict
      ? { href: "/leaderboard/predictions", label: T("Prediction leaderboard"), icon: Trophy, match: (p: string) => p.startsWith("/leaderboard/predictions") }
      : { href: "/leaderboard/launchpad",   label: T("Creator leaderboard"),    icon: Trophy, match: (p: string) => p.startsWith("/leaderboard/launchpad") || p === "/leaderboard" },
    { href: "/prediction",             label: T("Predictions"), icon: BarChart2,  match: (p: string) => isPredictSection(p) && !p.startsWith("/leaderboard") },
    { href: "/live",                   label: T("Live scores"), icon: Radio,      match: (p: string) => p.startsWith("/live") },
    { href: "/dashboard/launchpad",    label: T("My tokens"),   icon: User,       match: (p: string) => p.startsWith("/dashboard"), auth: true },
  ];
}

const EXTRA = [
  { href: "/settings/apps",              label: T("Connected apps"), description: T("AI assistants with access to your account"), icon: Plug, external: false },
  { href: "/agents",                    label: T("AI agents"),      description: T("Connect Claude, ChatGPT or Grok"),            icon: Bot,  external: false },
  { href: "/archive",                    label: T("Archive"),        description: T("Past markets and tokens"),       icon: Archive,     external: false },
  { href: "https://dexscreener.com/solana/egi97rat7zrxrqvvv7edb5tvxzzxwgdh8vwvkgpfzdfc", label: "$CLAWDTRUST", description: T("Our partner token on Solana"), icon: Coins, external: true },
  { href: "https://t.me/Omdotfun",       label: T("Support"),        description: T("Get help from the team"),        icon: Headset,     external: true  },
  { href: "/faq",                        label: T("FAQ"),            description: T("Frequently asked questions"),    icon: HelpCircle,  external: false },
  { href: "https://t.me/OmdotfunTuto",   label: T("Tutorial"),       description: T("Learn how to use OMdotfun"),     icon: BookOpen,    external: true  },
  { href: "/policy",                     label: T("ŌM Policy"),      description: T("Rules, prohibitions, removals"), icon: ShieldCheck, external: false },
  { href: "/privacy",                    label: T("Privacy Policy"), description: T("How we handle your data"),       icon: Lock,        external: false },
];

// Menu ⋯ : panneau ouvert à côté de la barre latérale
function MoreMenu({ onClose, wide }: { onClose: () => void; wide: boolean }) {
  const { tr } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className={`fixed bottom-4 z-[100] ${wide ? "left-[84px] xl:left-[262px]" : "left-[84px]"}`} >
      <p className="px-3 pb-1 pt-2 text-[15px] font-bold tracking-tight text-foreground">{tr("More")}</p>
      <ul className="space-y-0.5">
        {EXTRA.map(({ href, label, description, icon: Icon, external }) => (
          <li key={href}>
            <Link
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                <Icon className="size-[18px]" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-foreground">{tr(label)}</span>
                <span className="block text-xs text-muted-foreground">{tr(description)}</span>
              </span>
              {external && <ExternalLink className="size-3.5 shrink-0 text-muted-foreground/50" />}
            </Link>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}

export function DesktopSidebar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const { tr } = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { setMoreOpen(false); }, [pathname]);
  if (pathname.startsWith("/admin")) return null;
  const wide = isFeedSection(pathname);
  // Bouton d'icône, qui devient une ligne avec libellé quand la barre est élargie
  const row = wide ? "xl:h-12 xl:w-full xl:justify-start xl:gap-4 xl:rounded-full xl:px-3" : "";
  const lab = (t: string) => wide ? <span className="hidden truncate text-[17px] xl:inline">{t}</span> : null;

  return (
    <aside className={`sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col items-center gap-2 ${wide ? "xl:w-[250px] xl:items-stretch xl:px-3" : ""} overflow-y-auto scrollbar-none border-r border-border/60 bg-background py-4 lg:flex`}>
      <Link href="/" aria-label="OMdotfun" className={`mb-3 ${wide ? "xl:px-1.5" : ""}`}>
        <BrandLogo size={40} />
      </Link>

      {items(pathname).filter((i) => !i.auth || isAuthenticated).map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            title={tr(label)}
            aria-label={tr(label)}
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors ${row} ${
              active ? `bg-muted text-foreground ${wide ? "xl:bg-transparent xl:font-bold" : ""}` : `text-muted-foreground hover:bg-muted/60 hover:text-foreground ${wide ? "xl:text-foreground" : ""}`
            }`}
          >
            <Icon className="size-[22px] shrink-0" strokeWidth={active ? 2.25 : 1.75} />
            {lab(tr(label))}
          </Link>
        );
      })}

      <NotificationBell className={`size-11 shrink-0 rounded-2xl text-muted-foreground hover:bg-muted/60 hover:text-foreground ${row} ${wide ? "xl:text-foreground" : ""}`}>
        {lab(tr("Notifications"))}
      </NotificationBell>

      {/* Fil (grand écran) : grand bouton Publier */}
      {wide && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-compose"))}
          title={tr("Post")}
          aria-label={tr("Post")}
          className="btn-primary mt-2 flex size-11 shrink-0 items-center justify-center rounded-2xl xl:h-12 xl:w-full xl:rounded-full"
        >
          <PenLine className="size-5 xl:hidden" strokeWidth={2.25} />
          <span className="hidden text-[17px] font-bold xl:inline">{tr("Post")}</span>
        </button>
      )}

      {/* Launch */}
      {isAuthenticated ? (
        <Link href="/launchpad/create" title={tr("Launch a token")} aria-label={tr("Launch a token")} className={wide ? `mt-1 flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground hover:bg-muted/60 hover:text-foreground xl:text-foreground ${row}` : "btn-primary mt-2 flex size-11 items-center justify-center rounded-2xl"}>
          {wide ? <Rocket className="size-[22px] shrink-0" strokeWidth={1.75} /> : <Plus className="size-6" strokeWidth={2.5} />}
          {lab(tr("Launch a token"))}
        </Link>
      ) : (
        <button
          type="button"
          title={tr("Launch a token")}
          aria-label={tr("Launch a token")}
          onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
          className={wide ? `mt-1 flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground hover:bg-muted/60 hover:text-foreground xl:text-foreground ${row}` : "btn-primary mt-2 flex size-11 items-center justify-center rounded-2xl"}
        >
          {wide ? <Rocket className="size-[22px] shrink-0" strokeWidth={1.75} /> : <Plus className="size-6" strokeWidth={2.5} />}
          {lab(tr("Launch a token"))}
        </button>
      )}

      {/* Bas : wallet puis menu ⋯ */}
      <div className={`mt-auto flex flex-col items-center gap-2 ${wide ? "xl:flex-row xl:flex-wrap xl:justify-between" : ""}`}>
        <button
          type="button"
          title={isAuthenticated ? tr("My wallet") : tr("Connect wallet")}
          aria-label={isAuthenticated ? tr("My wallet") : tr("Connect wallet")}
          onClick={() => window.dispatchEvent(new CustomEvent(isAuthenticated ? "open-wallet-profile" : "open-wallet-connect"))}
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground hover:bg-muted/70 ${wide ? "xl:mb-1 xl:h-12 xl:w-full xl:justify-start xl:gap-3 xl:rounded-full xl:px-4" : ""}`}
        >
          <Wallet className="size-[20px] shrink-0" />
          {wide && <span className="hidden text-[15px] font-semibold xl:inline">{isAuthenticated ? tr("My wallet") : tr("Connect wallet")}</span>}
        </button>
        <ThemeSwitchRail />
        <LanguageSelectRail />
        <button
          type="button"
          title={tr("More")}
          aria-label={tr("More")}
          aria-expanded={moreOpen}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex size-11 items-center justify-center rounded-2xl transition-colors ${moreOpen ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
        >
          <MoreHorizontal className="size-[22px]" strokeWidth={1.75} />
        </button>
      </div>
      {moreOpen && <MoreMenu wide={wide} onClose={() => setMoreOpen(false)} />}
    </aside>
  );
}
