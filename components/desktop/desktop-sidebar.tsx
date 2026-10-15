"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, Trophy, BarChart2, User, Headset, Plus, Wallet, Coins, HelpCircle, BookOpen, ShieldCheck, Lock, Archive, MoreHorizontal, ExternalLink } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { LanguageSelectRail } from "@/components/shared/language-select";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

// Barre d'icônes verticale (ordinateur uniquement).

// Section prédiction : marchés, Up/Down, pools et leur leaderboard
const isPredictSection = (p: string) =>
  p.startsWith("/prediction") || p.startsWith("/updown") || p.startsWith("/pools") || p.startsWith("/crypto") || p.startsWith("/leaderboard/predictions");

function items(pathname: string) {
  const predict = isPredictSection(pathname);
  return [
    { href: "/",                       label: T("Tokens"),      icon: LayoutGrid, match: (p: string) => p === "/" || p === "/launchpad" || (p.startsWith("/launchpad/") && !p.startsWith("/launchpad/create")) },
    // Le trophée ouvre le leaderboard de la section en cours (comme sur téléphone)
    predict
      ? { href: "/leaderboard/predictions", label: T("Prediction leaderboard"), icon: Trophy, match: (p: string) => p.startsWith("/leaderboard/predictions") }
      : { href: "/leaderboard/launchpad",   label: T("Creator leaderboard"),    icon: Trophy, match: (p: string) => p.startsWith("/leaderboard/launchpad") || p === "/leaderboard" },
    { href: "/prediction",             label: T("Predictions"), icon: BarChart2,  match: (p: string) => isPredictSection(p) && !p.startsWith("/leaderboard") },
    { href: "/dashboard/launchpad",    label: T("My tokens"),   icon: User,       match: (p: string) => p.startsWith("/dashboard"), auth: true },
  ];
}

const EXTRA = [
  { href: "/archive",                    label: T("Archive"),        description: T("Past markets and tokens"),       icon: Archive,     external: false },
  { href: "https://dexscreener.com/solana/egi97rat7zrxrqvvv7edb5tvxzzxwgdh8vwvkgpfzdfc", label: "$CLAWDTRUST", description: T("Our partner token on Solana"), icon: Coins, external: true },
  { href: "https://t.me/Omdotfun",       label: T("Support"),        description: T("Get help from the team"),        icon: Headset,     external: true  },
  { href: "/faq",                        label: T("FAQ"),            description: T("Frequently asked questions"),    icon: HelpCircle,  external: false },
  { href: "https://t.me/OmdotfunTuto",   label: T("Tutorial"),       description: T("Learn how to use OMdotfun"),     icon: BookOpen,    external: true  },
  { href: "/policy",                     label: T("ŌM Policy"),      description: T("Rules, prohibitions, removals"), icon: ShieldCheck, external: false },
  { href: "/privacy",                    label: T("Privacy Policy"), description: T("How we handle your data"),       icon: Lock,        external: false },
];

// Menu ⋯ : panneau ouvert à côté de la barre latérale
function MoreMenu({ onClose }: { onClose: () => void }) {
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
    <div ref={ref} className="fixed bottom-4 left-[84px] z-[100] w-80 rounded-3xl border border-border bg-card p-2 shadow-2xl">
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

  return (
    <aside className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto scrollbar-none border-r border-border/60 bg-background py-4 lg:flex">
      <Link href="/" aria-label="OMdotfun" className="mb-3">
        <Image src="/omdot-icon.png" alt="OMdotfun" width={40} height={40} className="logo-bounce" />
      </Link>

      {items(pathname).filter((i) => !i.auth || isAuthenticated).map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            title={tr(label)}
            aria-label={tr(label)}
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
        <Link href="/launchpad/create" title={tr("Launch a token")} aria-label={tr("Launch a token")} className="btn-primary mt-2 flex size-11 items-center justify-center rounded-2xl">
          <Plus className="size-6" strokeWidth={2.5} />
        </Link>
      ) : (
        <button
          type="button"
          title={tr("Launch a token")}
          aria-label={tr("Launch a token")}
          onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
          className="btn-primary mt-2 flex size-11 items-center justify-center rounded-2xl"
        >
          <Plus className="size-6" strokeWidth={2.5} />
        </button>
      )}

      {/* Bas : wallet puis menu ⋯ */}
      <div className="mt-auto flex flex-col items-center gap-2">
        <button
          type="button"
          title={isAuthenticated ? tr("My wallet") : tr("Connect wallet")}
          aria-label={isAuthenticated ? tr("My wallet") : tr("Connect wallet")}
          onClick={() => window.dispatchEvent(new CustomEvent(isAuthenticated ? "open-wallet-profile" : "open-wallet-connect"))}
          className="flex size-11 items-center justify-center rounded-2xl bg-muted text-foreground hover:bg-muted/70"
        >
          <Wallet className="size-[20px]" />
        </button>
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
      {moreOpen && <MoreMenu onClose={() => setMoreOpen(false)} />}
    </aside>
  );
}
