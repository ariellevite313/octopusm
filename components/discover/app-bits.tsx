"use client";

/** Pièces communes de Discover : icône d'app, étoiles, badge « paie en $TICKER ». */
import { Star } from "lucide-react";

export type AppCard = {
  id: string; name: string; tagline: string; category: string; icon: string | null; banner: string | null;
  rating: number; ratings: number; siteUrl: string; createdAt: string;
  token: { id: string; ticker: string; name: string; logo: string | null; chain: string; slug: string };
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

export function PaysWith({ app, className = "" }: { app: Pick<AppCard, "token">; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {app.token.logo && <img src={app.token.logo} alt="" className="size-3.5 rounded-full object-cover" />}
      ${app.token.ticker}
    </span>
  );
}
