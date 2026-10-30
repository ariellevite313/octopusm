"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, ChevronLeft, ChevronRight, ListChecks, Rocket, Trophy, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";

type Slide = { icon: LucideIcon; title: string; text: string; cta: string; href: string; needsWallet?: boolean };

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
  return [
    { icon: Users, title: tr("Invite friends, earn on every trade"), text: tr("You get 10% of the platform fee on each trade your friends make."), cta: tr("Get my link"), href: "/dashboard/referrals", needsWallet: true },
    { icon: Rocket, title: tr("Launch your token in 2 minutes"), text: tr("Solana or Arc. Earn creator fees on every trade, forever."), cta: tr("Launch a token"), href: "/launchpad/create", needsWallet: true },
    { icon: BarChart3, title: tr("Create a prediction market"), text: tr("Ask any question. Share it in the feed and earn when your followers bet."), cta: tr("Create a market"), href: "/pools", needsWallet: true },
    { icon: Trophy, title: tr("Hackathon: up to 100,000 USDC"), text: tr("Launch a token, rally voters and climb the leaderboard. Voters win 20% too."), cta: tr("Join the hackathon"), href: "/hackathon" },
    { icon: ListChecks, title: tr("Your daily tasks are waiting"), text: tr("Post, share a market, invite someone. Every action earns OMERO."), cta: tr("See my tasks"), href: "/dashboard/tasks", needsWallet: true },
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
      <div className="relative overflow-hidden rounded-3xl bg-neutral-950 p-5 text-white ring-1 ring-white/10">
        <Icon aria-hidden className="pointer-events-none absolute -bottom-6 -right-4 size-40 text-white/[0.07]" strokeWidth={1.2} />
        <div key={i} className="relative animate-in fade-in slide-in-from-right-2 duration-300">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-white/10"><Icon className="size-6" /></div>
          <h3 className="mt-4 max-w-[85%] text-[22px] font-extrabold leading-tight tracking-tight">{s.title}</h3>
          <p className="mt-2 max-w-[85%] text-[15px] leading-snug text-white/65">{s.text}</p>
          <div className="mt-5 flex items-center justify-between">
            {dest ? (
              <Link href={dest} className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">
                {s.cta}<ArrowRight className="size-4" />
              </Link>
            ) : (
              <button onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">
                {tr("Connect to start")}<ArrowRight className="size-4" />
              </button>
            )}
            <div className="flex items-center gap-1 text-white/60">
              <button aria-label={tr("Previous")} onClick={() => go(i - 1)} className="flex size-8 items-center justify-center rounded-full hover:bg-white/10"><ChevronLeft className="size-4" /></button>
              <span className="num w-9 text-center text-sm font-semibold"><span className="text-white">{i + 1}</span>/{n}</span>
              <button aria-label={tr("Next")} onClick={() => go(i + 1)} className="flex size-8 items-center justify-center rounded-full hover:bg-white/10"><ChevronRight className="size-4" /></button>
            </div>
          </div>
        </div>
        {/* Ligne de progression */}
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
          <div
            key={`${i}-${tick}`}
            className="h-full bg-white/80"
            style={{ animation: `promo-progress ${ROTATE_MS}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }}
          />
        </div>
      </div>
      <style>{`@keyframes promo-progress{from{width:0}to{width:100%}}`}</style>
    </div>
  );
}
