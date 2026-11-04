"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, ListChecks, Rocket, Trophy, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";

type Slide = { icon: LucideIcon; accent: string; live: string; title: string; text: string; cta: string; href: string; needsWallet?: boolean };

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
    { icon: Users, accent: "#34d399", live: tr("10% of fees, for life"), title: tr("Invite friends"), text: tr("You get 10% of the platform fee on each trade your friends make."), cta: tr("Get my link"), href: "/dashboard/referrals", needsWallet: true },
    { icon: Rocket, accent: "#fb923c", live: tokenCount ? tr("{n} tokens launched", { n: tokenCount }) : tr("Live on Solana and Arc"), title: tr("Launch a token"), text: tr("Solana or Arc, in 2 minutes. Earn creator fees on every trade."), cta: tr("Launch a token"), href: "/launchpad/create", needsWallet: true },
    { icon: BarChart3, accent: "#38bdf8", live: tr("Open to everyone"), title: tr("Prediction markets"), text: tr("Ask any question, share it, earn when your followers bet."), cta: tr("Create a market"), href: "/pools", needsWallet: true },
    { icon: Trophy, accent: "#facc15", live: tr("Starts Nov 24"), title: tr("OM Hackathon"), text: tr("Up to 100,000 USDC. Launch a token, rally voters, climb the board."), cta: tr("Join the hackathon"), href: "/hackathon" },
    { icon: ListChecks, accent: "#a78bfa", live: tr("New every day"), title: tr("Daily tasks"), text: tr("Post, share a market, invite someone. Every action earns OMERO."), cta: tr("See my tasks"), href: "/dashboard/tasks", needsWallet: true },
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
        {/* Visuel animé (comme la référence) : éclat + anneau, balancement 3D, reflet, rotation, nouvel éclat */}
        <div className="pa w-[34%] max-w-[132px] shrink-0 rounded-2xl bg-neutral-950" style={{ ["--acc" as string]: s.accent }}>
          <div aria-hidden className="pa-glow" />
          <div aria-hidden className="pa-rays" />
          <div aria-hidden className="pa-ring" />
          <div aria-hidden className="pa-item"><div className="pa-face"><Icon className="pa-icon" strokeWidth={2.2} /></div></div>
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
      <style>{`.pa{position:relative;perspective:520px;display:flex;align-items:center;justify-content:center;overflow:hidden} .pa-glow{position:absolute;width:70%;height:70%;border-radius:9999px;background:var(--acc);filter:blur(22px);opacity:0;animation:pa-glow 5.5s ease-out both} .pa-rays{position:absolute;width:160%;height:160%;background:repeating-conic-gradient(from 0deg,color-mix(in srgb,var(--acc) 55%,transparent) 0deg 3deg,transparent 3deg 22deg);-webkit-mask:radial-gradient(circle,#000 18%,transparent 62%);mask:radial-gradient(circle,#000 18%,transparent 62%);opacity:0;animation:pa-rays 5.5s linear both} .pa-ring{position:absolute;width:78%;aspect-ratio:1;border-radius:9999px;border:3px solid rgba(255,255,255,.85);box-shadow:0 0 18px var(--acc),inset 0 0 18px var(--acc);opacity:0;animation:pa-ring 5.5s ease-out both} .pa-item{position:relative;width:46%;aspect-ratio:.72;transform-style:preserve-3d;animation:pa-item 5.5s cubic-bezier(.3,.7,.2,1) both} .pa-face{position:absolute;inset:0;border-radius:12px;backface-visibility:visible;overflow:hidden;  background:linear-gradient(160deg,color-mix(in srgb,var(--acc) 92%,#fff) 0%,var(--acc) 38%,color-mix(in srgb,var(--acc) 45%,#000) 100%);  box-shadow:0 10px 24px rgba(0,0,0,.55),inset 0 0 0 1.5px rgba(255,255,255,.55),inset 0 0 0 4px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:#0b0a12} .pa-face::before{content:"";position:absolute;left:8%;right:8%;top:6%;height:16%;border-radius:6px;background:rgba(255,255,255,.85)} .pa-face::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.75) 47%,transparent 60%);transform:translateX(-130%);animation:pa-shine 5.5s ease-in-out both} .pa-icon{position:relative;margin-top:16%;width:44%;height:44%} @keyframes pa-item{  0%{transform:scale(.4) rotateY(-90deg);opacity:0}  9%{transform:scale(1.12) rotateY(0);opacity:1}  14%{transform:scale(1) rotateY(0)}  28%{transform:scale(1) rotateY(-12deg) rotateX(4deg)}  42%{transform:scale(1) rotateY(12deg) rotateX(-4deg)}  54%{transform:scale(1) rotateY(0)}  76%{transform:scale(.92) rotateY(720deg)}  84%{transform:scale(1.1) rotateY(720deg)}  90%,100%{transform:scale(1) rotateY(720deg);opacity:1}} @keyframes pa-ring{0%{transform:scale(.35);opacity:0}4%{opacity:1}22%{transform:scale(1.35);opacity:0}  78%{transform:scale(.35);opacity:0}80%{opacity:1}97%{transform:scale(1.35);opacity:0}100%{opacity:0}} @keyframes pa-rays{0%{opacity:0;transform:rotate(0)}6%{opacity:1}24%{opacity:0;transform:rotate(40deg)}  78%{opacity:0}82%{opacity:1}98%{opacity:0;transform:rotate(120deg)}100%{opacity:0}} @keyframes pa-glow{0%{opacity:0}7%{opacity:.85}30%{opacity:.25}78%{opacity:.25}82%{opacity:.85}100%{opacity:.3}} @keyframes pa-shine{0%,30%{transform:translateX(-130%)}42%{transform:translateX(130%)}43%,58%{transform:translateX(-130%)}68%{transform:translateX(130%)}100%{transform:translateX(130%)}} @media (prefers-reduced-motion:reduce){.pa-glow,.pa-rays,.pa-ring,.pa-item,.pa-face::after{animation:none}.pa-item{opacity:1}} `}</style>
    </div>
  );
}
