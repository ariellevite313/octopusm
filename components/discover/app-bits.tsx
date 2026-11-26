"use client";

/** Pièces communes de Discover : icône d'app, étoiles, badge « paie en $TICKER ». */
import { Star } from "lucide-react";
import { XIcon, TgIcon, DiscordIcon } from "@/components/shared/share-sheet";

export type AppCard = {
  id: string; name: string; tagline: string; category: string; icon: string | null; banner: string | null;
  rating: number; ratings: number; visits: number; siteUrl: string; createdAt: string; platform?: boolean; boostedUntil?: string | null; noToken?: boolean; network?: string | null; verified?: boolean; socials?: { x: string | null; telegram: string | null; discord: string | null };
  token: { id: string; ticker: string; name: string; logo: string | null; chain: string; slug: string; price?: number | null; mcap?: number | null; volume24h?: number | null; pool?: string | null; mint?: string | null; curve?: string | null };
};

export function AppIcon({ app, className = "size-14" }: { app: Pick<AppCard, "icon" | "name">; className?: string }) {
  return app.icon
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={app.icon} alt="" className={`${className} shrink-0 rounded-[22%] bg-muted object-cover`} />
    : <span className={`${className} flex shrink-0 items-center justify-center rounded-[22%] bg-muted text-xl font-extrabold`}>{app.name.slice(0, 1)}</span>;
}

export function Rating({ value, count, className = "" }: { value: number; count?: number; className?: string }) {
  if (!count) return null;
  return <span className={`num inline-flex items-center gap-0.5 ${className}`}>{value.toFixed(1)}<Star className="size-3 fill-current" />{count != null && <span className="ml-1 text-muted-foreground">({count})</span>}</span>;
}

/**
 * Ce qui suit le nom d'un projet : la puce bleue (donnée par l'admin) puis l'icône du token
 * (ou du réseau pour une fiche sans token), sans son nom.
 */
export function NameMarks({ app, size = "size-4" }: { app: Pick<AppCard, "verified">; size?: string }) {
  // Après le nom : seulement la puce bleue (plus de token ni de blockchain)
  if (!app.verified) return null;
  return (
    <span className="inline-flex shrink-0 items-center align-middle">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/verified.png" alt="Verified" title="Verified" className={`${size} shrink-0 select-none object-contain`} draggable={false} />
    </span>
  );
}

/** Réseaux sociaux du projet, en petites icônes sur la ligne sous le nom (dans une carte cliquable : boutons, pas de lien imbriqué). */
export function SocialIcons({ s, className = "" }: { s?: AppCard["socials"]; className?: string }) {
  if (!s || (!s.x && !s.telegram && !s.discord)) return null;
  const go = (url: string) => (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); window.open(url, "_blank", "noopener,noreferrer"); };
  const btn = "flex size-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-[14px]";
  return (
    <span className={`inline-flex items-center ${className}`}>
      {s.x && <button type="button" onClick={go(s.x)} aria-label="X" className={btn}><XIcon /></button>}
      {s.telegram && <button type="button" onClick={go(s.telegram)} aria-label="Telegram" className={btn}><TgIcon /></button>}
      {s.discord && <button type="button" onClick={go(s.discord)} aria-label="Discord" className={btn}><DiscordIcon /></button>}
    </span>
  );
}

const NET: Record<string, string> = { solana: "Solana", arc: "Arc", base: "Base", bnb: "BNB Chain", ethereum: "Ethereum" };

export function PaysWith({ app, className = "" }: { app: Pick<AppCard, "token" | "platform" | "noToken" | "network">; className?: string }) {
  // Fiche de l'admin ou sans token : on montre le réseau, pas un token
  if (app.platform || app.noToken) {
    const n = app.network && NET[app.network] ? app.network : null;
    if (!n) return null;
    return (
      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/chains/${n}.png`} alt="" className="size-3.5 rounded-full object-cover" />
        {NET[n]}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {app.token.logo && <img src={app.token.logo} alt="" className="size-3.5 rounded-full object-cover" />}
      ${app.token.ticker}
    </span>
  );
}

/** 1234 → 1.2K, 2500000 → 2.5M */
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(n));

/** Ouvre le site du projet et compte la visite (sans bloquer l'ouverture). */
export function visit(id: string) {
  try { navigator.sendBeacon?.(`/api/discover/apps/${id}/visit`) || fetch(`/api/discover/apps/${id}/visit`, { method: "POST", keepalive: true }); } catch { /* sans effet */ }
}
