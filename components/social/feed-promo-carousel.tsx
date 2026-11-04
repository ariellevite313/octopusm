"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, ListChecks, Rocket, Trophy, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";

type Slide = { icon: LucideIcon; live: string; title: string; text: string; cta: string; href: string; needsWallet?: boolean };

const ROTATE_MS = 5500;

/** Cartes qui défilent en haut du fil : parrainage, token, marché, hackathon, tâches du jour. */
export function FeedPromoCarousel() {
  return (
    <>
      <div className="lg:hidden"><PromoCarouselCard /></div>
      <div className="hidden lg:block"><PromoMarquee /></div>
    </>
  );
}

function useSlides(): Slide[] {
  const { tr } = useT();
  // Vrai chiffre de la plateforme pour la carte token (rien d'inventé)
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/launchpad/platform-stats").then((r) => (r.ok ? r.json() : null))
      .then((j: { tokenCount?: number } | null) => { if (typeof j?.tokenCount === "number") setTokenCount(j.tokenCount); })
      .catch(() => {});
  }, []);
  return [
    { icon: Users, live: tr("10% of fees, for life"), title: tr("Invite friends"), text: tr("You get 10% of the platform fee on each trade your friends make."), cta: tr("Get my link"), href: "/dashboard/referrals", needsWallet: true },
    { icon: Rocket, live: tokenCount ? tr("{n} tokens launched", { n: tokenCount }) : tr("Live on Solana and Arc"), title: tr("Launch a token"), text: tr("Solana or Arc, in 2 minutes. Earn creator fees on every trade."), cta: tr("Launch a token"), href: "/launchpad/create", needsWallet: true },
    { icon: BarChart3, live: tr("Open to everyone"), title: tr("Prediction markets"), text: tr("Ask any question, share it, earn when your followers bet."), cta: tr("Create a market"), href: "/pools", needsWallet: true },
    { icon: Trophy, live: tr("Starts Nov 24"), title: tr("OM Hackathon"), text: tr("Up to 100,000 USDC. Launch a token, rally voters, climb the board."), cta: tr("Join the hackathon"), href: "/hackathon" },
    { icon: ListChecks, live: tr("New every day"), title: tr("Daily tasks"), text: tr("Post, share a market, invite someone. Every action earns OMERO."), cta: tr("See my tasks"), href: "/dashboard/tasks", needsWallet: true },
  ];
}

/** Ordinateur : petites cases qui défilent en continu (pause au survol). */
function PromoMarquee() {
  const slides = useSlides();
  const { isAuthenticated } = useAuth();
  const loop = [...slides, ...slides];
  return (
    <div className="group relative overflow-hidden border-b border-border py-3 [mask-image:linear-gradient(to_right,transparent,#000_4%,#000_96%,transparent)]">
      <div className="flex w-max gap-3 px-3 [animation:promo-marquee_48s_linear_infinite] group-hover:[animation-play-state:paused]">
        {loop.map((s, k) => {
          const Icon = s.icon;
          const body = (
            <>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background"><Icon className="size-[18px]" /></span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold leading-tight text-foreground">{s.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{s.cta}</span>
              </span>
            </>
          );
          const cls = "flex w-[250px] shrink-0 items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted";
          return !isAuthenticated && s.needsWallet ? (
            <button key={k} onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} className={`${cls} text-left`}>{body}</button>
          ) : (
            <Link key={k} href={s.href} className={cls}>{body}</Link>
          );
        })}
      </div>
      <style>{`@keyframes promo-marquee{from{transform:translateX(0)}to{transform:translateX(calc(-50% - 6px))}}`}</style>
    </div>
  );
}

function PromoCarouselCard() {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0); // relance la barre de progression à chaque changement
  const touch = useRef<number | null>(null);

  const slides = useSlides();
  const n = slides.length;

  const go = useCallback((to: number) => { setI(((to % n) + n) % n); setTick((t) => t + 1); }, [n]);

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => go(i + 1), ROTATE_MS);
    return () => clearTimeout(id);
  }, [i, tick, paused, go]);

  const s = slides[i];
  const Icon = s.icon;
  const dest = !isAuthenticated && s.needsWallet ? null : s.href;

  return (
    <div
      className="px-4 pt-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => { setPaused(false); setTick((t) => t + 1); }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; setPaused(true); }}
      onTouchEnd={(e) => {
        const d = touch.current != null ? e.changedTouches[0].clientX - touch.current : 0;
        touch.current = null;
        setPaused(false);
        setTick((t) => t + 1);
        if (Math.abs(d) > 40) go(i + (d < 0 ? 1 : -1));
      }}
    >
      {/* Petite carte horizontale : visuel animé à gauche, texte et bouton à droite */}
      <div key={i} className="flex items-stretch gap-3.5 rounded-[22px] bg-neutral-900 p-3 text-white ring-1 ring-white/10 animate-in fade-in duration-300">
        <div className="promo-art relative flex w-[34%] max-w-[132px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-950">
          <div aria-hidden className="absolute size-20 rounded-full bg-white/15 blur-2xl promo-glow" />
          <Icon aria-hidden className="relative size-12 text-white promo-float" strokeWidth={1.6} />
          <div aria-hidden className="promo-shine absolute inset-0" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col py-0.5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-400">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-emerald-400" /></span>
            <span className="truncate">{s.live}</span>
          </p>
          <h3 className="mt-1 truncate text-[16px] font-bold leading-tight">{s.title}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/60">{s.text}</p>
          <div className="mt-auto pt-2.5">
            {dest ? (
              <Link href={dest} className="block w-full rounded-full bg-white py-2 text-center text-[14px] font-bold text-black">{s.cta}</Link>
            ) : (
              <button onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} className="block w-full rounded-full bg-white py-2 text-center text-[14px] font-bold text-black">
                {tr("Connect to start")}
              </button>
            )}
          </div>
        </div>
      </div>
      <style>{`
        .promo-shine{background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.28) 50%,transparent 65%);transform:translateX(-120%);animation:promo-shine 2.8s ease-in-out infinite}
        @keyframes promo-shine{0%,35%{transform:translateX(-120%)}70%,100%{transform:translateX(120%)}}
        .promo-float{animation:promo-float 3s ease-in-out infinite}
        @keyframes promo-float{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-4px) rotate(4deg)}}
        .promo-glow{animation:promo-glow 3s ease-in-out infinite}
        @keyframes promo-glow{0%,100%{opacity:.5;transform:scale(.9)}50%{opacity:1;transform:scale(1.15)}}
        @media (prefers-reduced-motion: reduce){.promo-shine,.promo-float,.promo-glow{animation:none}}
      `}</style>
    </div>
  );
}
