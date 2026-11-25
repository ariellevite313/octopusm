"use client";

import { NotificationBell } from "@/components/social/notification-bell";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PanelLeft, Users, LayoutGrid, Trophy, BarChart2, User, MessageSquare, Radio, Plug, Bot, Headset, Plus, Wallet, Coins, HelpCircle, BookOpen, ShieldCheck, Lock, Archive, MoreHorizontal, ExternalLink, PenLine, Rocket, Award, CandlestickChart, Megaphone, Shield, Compass, Gem, Palette } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { JanusIcon } from "@/components/janus/janus-icon";
import { LanguageSelectRail } from "@/components/shared/language-select";
import { DogeSwitchRail, ThemeSwitchRail } from "@/components/shared/theme-switch";
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
    { href: "/discover",               label: T("Discover"),    icon: Compass,    match: (p: string) => p.startsWith("/discover") },
    { href: "/communities",            label: T("Communities"), icon: Users,      match: (p: string) => p.startsWith("/communities") || p.startsWith("/c/") },
    { href: "/launchpad",              label: T("Tokens"),      icon: LayoutGrid, match: (p: string) => p === "/launchpad" || (p.startsWith("/launchpad/") && !p.startsWith("/launchpad/create")) },
    { href: "/terminal",               label: T("Terminal"),    icon: CandlestickChart, match: (p: string) => p.startsWith("/terminal") },
    { href: "/janus",                  label: T("Janus"),       icon: JanusIcon,  match: (p: string) => p.startsWith("/janus") },
    { href: "/nft",                    label: T("NFT"),         icon: Gem,        match: (p: string) => p.startsWith("/nft"), disabled: true },
    { href: "/studio",                 label: T("Studio"),      icon: Palette,    match: (p: string) => p.startsWith("/studio") },
    { href: "/ambassadors",            label: T("Ambassadors"), icon: Megaphone,      match: (p: string) => p.startsWith("/ambassadors") },
    // Le trophée ouvre le leaderboard de la section en cours (comme sur téléphone)
    predict
      ? { href: "/leaderboard/predictions", label: T("Prediction leaderboard"), icon: Trophy, match: (p: string) => p.startsWith("/leaderboard/predictions") }
      : { href: "/leaderboard/launchpad",   label: T("Creator leaderboard"),    icon: Trophy, match: (p: string) => p.startsWith("/leaderboard/launchpad") || p === "/leaderboard" },
    { href: "/prediction",             label: T("Predictions"), icon: BarChart2,  match: (p: string) => isPredictSection(p) && !p.startsWith("/leaderboard") },
    { href: "/live",                   label: T("Live scores"), icon: Radio,      match: (p: string) => p.startsWith("/live") },
    { href: "/dashboard/launchpad",    label: T("My tokens"),   icon: User,       match: (p: string) => p.startsWith("/dashboard"), auth: true },
    { href: "/admin",                  label: T("Admin"),       icon: Shield,     match: (p: string) => p.startsWith("/admin"), admin: true },
  ];
}

const EXTRA = [
  { href: "/settings/apps",              label: T("Connected apps"), description: T("AI assistants with access to your account"), icon: Plug, external: false },
  { href: "/agents",                    label: T("AI agents"),      description: T("Connect Claude, ChatGPT or Grok"),            icon: Bot,  external: false },
  { href: "/archive",                    label: T("Archive"),        description: T("Past markets and tokens"),       icon: Archive,     external: false },
  { href: "https://dexscreener.com/solana/egi97rat7zrxrqvvv7edb5tvxzzxwgdh8vwvkgpfzdfc", label: "$CLAWDTRUST", description: T("Our partner token on Solana"), icon: Coins, external: true },
  { href: "https://t.me/Omdotfun",       label: T("Support"),        description: T("Get help from the team"),        icon: Headset,     external: true  },
  { href: "/faq",                        label: T("FAQ"),            description: T("Frequently asked questions"),    icon: HelpCircle,  external: false },
  { href: "/guide",                      label: T("User guide"),     description: T("Learn how to use OMdotfun"),     icon: BookOpen,    external: false },
  { href: "https://t.me/OmdotfunTuto",   label: T("Tutorial"),       description: T("Video tutorials on Telegram"),   icon: BookOpen,    external: true  },
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
    <div ref={ref} className={`fixed bottom-4 z-[100] max-h-[calc(100vh-2rem)] w-[300px] overflow-y-auto rounded-3xl border border-border bg-background p-2 shadow-2xl scrollbar-none ${wide ? "left-[84px] xl:left-[252px]" : "left-[84px]"}`}>
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

const OPEN_KEY = "om_sidebar_open_v1";

export function DesktopSidebar() {
  const pathname = usePathname();
  const { isAuthenticated, isAdmin } = useAuth();
  const { tr } = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  // Barre ouverte (libellés visibles sur grand écran), mémorisée par appareil
  const [open, setOpen] = useState(true);
  // Lien touché : la pastille glisse tout de suite, sans attendre la navigation
  const [pending, setPending] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [pill, setPill] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => { try { if (localStorage.getItem(OPEN_KEY) === "0") setOpen(false); } catch {} }, []);
  useEffect(() => { setMoreOpen(false); setPending(null); }, [pathname]);
  const toggle = () => setOpen((v) => { try { localStorage.setItem(OPEN_KEY, v ? "0" : "1"); } catch {} return !v; });

  const list = items(pathname).filter((i) => (!i.auth || isAuthenticated) && (!("admin" in i) || isAdmin));
  const activeHref = pending ?? list.find((i) => !("disabled" in i && i.disabled) && i.match(pathname))?.href ?? null;

  // Position de la pastille sous le lien actif
  const measure = useCallback(() => {
    const el = activeHref ? itemRefs.current.get(activeHref) : null;
    setPill(el ? { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight } : null);
  }, [activeHref]);
  useLayoutEffect(() => { measure(); }, [measure, open]);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(nav);
    return () => ro.disconnect();
  }, [measure]);

  if (pathname.startsWith("/admin")) return null;
  const wide = open;
  // Bouton d'icône, qui devient une ligne avec libellé quand la barre est ouverte (grand écran)
  const row = wide ? "xl:h-11 xl:w-full xl:justify-start xl:gap-3.5 xl:rounded-2xl xl:px-3" : "";
  const lab = (t: string) => wide ? <span className="sidebar-label hidden truncate text-[15px] xl:inline">{t}</span> : null;
  const setRef = (href: string) => (el: HTMLElement | null) => { if (el) itemRefs.current.set(href, el); else itemRefs.current.delete(href); };

  return (
    <aside className={`sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto scrollbar-none border-r border-border/60 bg-background py-4 transition-[width,padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex ${wide ? "xl:w-[240px] xl:items-stretch xl:px-3" : ""}`}>
      <div className={`mb-3 flex items-center ${wide ? "xl:justify-between xl:px-1.5" : "flex-col gap-2"}`}>
        <Link href="/" aria-label="OMdotfun">
          <BrandLogo size={40} />
        </Link>
        <button
          type="button"
          onClick={toggle}
          title={tr(open ? "Close menu" : "Open menu")}
          aria-label={tr(open ? "Close menu" : "Open menu")}
          aria-expanded={open}
          className="hidden size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground xl:flex"
        >
          <PanelLeft className="size-[18px]" strokeWidth={1.75} />
        </button>
      </div>

      <nav ref={navRef} className={`relative flex flex-col items-center gap-2 ${wide ? "xl:items-stretch" : ""}`}>
        {/* Pastille translucide qui glisse vers le lien choisi */}
        {pill && (
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-2xl bg-foreground/[0.06] ring-1 ring-inset ring-foreground/10 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ top: pill.top, left: pill.left, width: pill.width, height: pill.height }}
          />
        )}
        {list.map((item) => {
          const { href, label, icon: Icon } = item;
          const active = href === activeHref;
          // Section désactivée : grisée, non cliquable, sans mention
          if ("disabled" in item && item.disabled) return (
            <span key={href} title={tr(label)} aria-label={tr(label)} aria-disabled="true"
              className={`flex size-11 shrink-0 cursor-not-allowed select-none items-center justify-center rounded-2xl text-muted-foreground/40 ${row}`}>
              <Icon className="size-[22px] shrink-0" strokeWidth={1.75} />
              {lab(tr(label))}
            </span>
          );
          return (
            <Link
              key={href}
              ref={setRef(href)}
              href={href}
              title={tr(label)}
              aria-label={tr(label)}
              aria-current={active ? "page" : undefined}
              onClick={() => setPending(href)}
              className={`relative flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors duration-200 ${row} ${
                active ? "font-semibold text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
              }`}
            >
              <Icon className="size-[22px] shrink-0" strokeWidth={active ? 2.25 : 1.75} />
              {lab(tr(label))}
            </Link>
          );
        })}

        <NotificationBell className={`size-11 shrink-0 rounded-2xl text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground ${row}`}>
          {lab(tr("Notifications"))}
        </NotificationBell>
      </nav>

      {/* Fil : bouton Publier */}
      {isFeedSection(pathname) && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-compose"))}
          title={tr("Post")}
          aria-label={tr("Post")}
          className={`btn-primary mt-2 flex size-11 shrink-0 items-center justify-center rounded-2xl ${wide ? "xl:h-11 xl:w-full xl:rounded-full" : ""}`}
        >
          <PenLine className={`size-5 ${wide ? "xl:hidden" : ""}`} strokeWidth={2.25} />
          {wide && <span className="hidden text-[15px] font-bold xl:inline">{tr("Post")}</span>}
        </button>
      )}

      {/* Launch */}
      {isAuthenticated ? (
        <Link href="/launchpad/create" title={tr("Launch a token")} aria-label={tr("Launch a token")} className={`mt-1 flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground ${row}`}>
          <Rocket className="size-[22px] shrink-0" strokeWidth={1.75} />
          {lab(tr("Launch a token"))}
        </Link>
      ) : (
        <button
          type="button"
          title={tr("Launch a token")}
          aria-label={tr("Launch a token")}
          onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
          className={`mt-1 flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground ${row}`}
        >
          <Rocket className="size-[22px] shrink-0" strokeWidth={1.75} />
          {lab(tr("Launch a token"))}
        </button>
      )}

      {/* Bas : wallet puis menu ⋯ */}
      <div className={`mt-auto flex flex-col items-center gap-2 pt-2 ${wide ? "xl:flex-row xl:flex-wrap xl:justify-between" : ""}`}>
        <button
          type="button"
          title={isAuthenticated ? tr("My wallet") : tr("Connect wallet")}
          aria-label={isAuthenticated ? tr("My wallet") : tr("Connect wallet")}
          onClick={() => window.dispatchEvent(new CustomEvent(isAuthenticated ? "open-wallet-profile" : "open-wallet-connect"))}
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground hover:bg-muted/70 ${wide ? "xl:mb-1 xl:h-11 xl:w-full xl:justify-start xl:gap-3 xl:rounded-full xl:px-4" : ""}`}
        >
          <Wallet className="size-[20px] shrink-0" />
          {wide && <span className="hidden text-[15px] font-semibold xl:inline">{isAuthenticated ? tr("My wallet") : tr("Connect wallet")}</span>}
        </button>
        <DogeSwitchRail />
        <ThemeSwitchRail />
        <LanguageSelectRail />
        <button
          type="button"
          title={tr("More")}
          aria-label={tr("More")}
          aria-expanded={moreOpen}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex size-11 items-center justify-center rounded-2xl transition-colors ${moreOpen ? "bg-foreground/[0.06] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"}`}
        >
          <MoreHorizontal className="size-[22px]" strokeWidth={1.75} />
        </button>
      </div>
      {moreOpen && <MoreMenu wide={wide} onClose={() => setMoreOpen(false)} />}
    </aside>
  );
}
