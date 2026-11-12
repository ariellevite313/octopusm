"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, ListChecks, Rocket, Trophy, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { PawIcon } from "@/components/shared/paw-icon";

type Slide = { icon: LucideIcon; accent: string; live: string; title: string; text: string; cta: string; href: string; needsWallet?: boolean };

const ROTATE_MS = 10000; // 10 s par annonce : la carte a le temps de bien tourner sur elle-même

/** Cartes qui défilent en haut du fil : parrainage, token, marché, hackathon, tâches du jour. */
const HIDE_KEY = "om_promo_hidden_until";
const HIDE_MS = 60 * 60 * 1000; // fermée : elle revient au bout d'une heure

export function FeedPromoCarousel() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const check = () => {
      let until = 0;
      try { until = Number(localStorage.getItem(HIDE_KEY) ?? 0); } catch { /* stockage indisponible */ }
      setHidden(Date.now() < until);
      return until;
    };
    const until = check();
    if (Date.now() >= until) return;
    const t = setTimeout(check, until - Date.now() + 500);
    return () => clearTimeout(t);
  }, []);
  if (hidden) return null;
  return <PromoCarouselCard onClose={() => { try { localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_MS)); } catch { /* ignore */ } setHidden(true); }} />;
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

function PromoCarouselCard({ onClose }: { onClose: () => void }) {
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
      <div key={i} className="relative flex items-stretch gap-3.5 rounded-[22px] bg-neutral-900 p-3 text-white ring-1 ring-white/10 animate-in fade-in duration-300">
        <button onClick={onClose} aria-label={tr("Close")} className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"><X className="size-4" /></button>
        {/* Visuel animé : carte holographique inclinée sur fond hexagonal, sphères brillantes, étincelles,
            et la séquence de la référence (éclat + anneau, balancement 3D, reflet, rotation, nouvel éclat) */}
        <div className="pa w-[34%] max-w-[132px] shrink-0 rounded-2xl" style={{ ["--acc" as string]: s.accent }}>
          <svg aria-hidden className="pa-hex" viewBox="0 0 100 100" fill="none" stroke="currentColor">
            <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" strokeWidth="1.4" />
            <polygon points="50,18 78,34 78,66 50,82 22,66 22,34" strokeWidth="0.8" opacity="0.7" />
            <path d="M50 6V18M88 28L78 34M88 72L78 66M50 94V82M12 72L22 66M12 28L22 34" strokeWidth="0.8" opacity="0.7" />
          </svg>
          <div aria-hidden className="pa-glow" />
          <div aria-hidden className="pa-rays" />
          <div aria-hidden className="pa-ring" />
          <div aria-hidden className="pa-tilt">
            <div className="pa-item">
              <div className="pa-face pa-front">
                <div className="pa-holo" />
                <div className="pa-in"><div className="pa-foil" /><Icon className="pa-icon" strokeWidth={2.2} /></div>
              </div>
              {/* Dos de la carte : visible pendant qu'elle tourne sur elle-même */}
              <div className="pa-face pa-back">
                <div className="pa-holo" />
                <div className="pa-in"><div className="pa-foil" /><PawIcon className="pa-icon" /></div>
              </div>
            </div>
          </div>
          <div aria-hidden className="pa-orb o1"><Icon strokeWidth={2.4} /></div>
          <div aria-hidden className="pa-orb o2"><Icon strokeWidth={2.4} /></div>
          <i aria-hidden className="pa-sp s1" /><i aria-hidden className="pa-sp s2" /><i aria-hidden className="pa-sp s3" /><i aria-hidden className="pa-sp s4" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col py-0.5">
          <p className="flex items-center gap-1.5 pr-8 text-[13px] font-semibold" style={{ color: s.accent }}>
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: s.accent }} /><span className="relative inline-flex size-2 rounded-full" style={{ background: s.accent }} /></span>
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
      <style>{`.pa{position:relative;perspective:520px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(circle at 50% 55%,color-mix(in srgb,var(--acc) 22%,#09090b) 0%,#09090b 70%)} .pa-hex{position:absolute;width:120%;height:120%;opacity:.55;color:var(--acc);animation:pa-hex 10s linear both} .pa-glow{position:absolute;width:70%;height:70%;border-radius:9999px;background:var(--acc);filter:blur(22px);opacity:0;animation:pa-glow 10s ease-out both} .pa-rays{position:absolute;width:160%;height:160%;background:repeating-conic-gradient(from 0deg,color-mix(in srgb,var(--acc) 55%,transparent) 0deg 3deg,transparent 3deg 22deg);-webkit-mask:radial-gradient(circle,#000 18%,transparent 62%);mask:radial-gradient(circle,#000 18%,transparent 62%);opacity:0;animation:pa-rays 10s linear both} .pa-ring{position:absolute;width:78%;aspect-ratio:1;border-radius:9999px;border:3px solid rgba(255,255,255,.85);box-shadow:0 0 18px var(--acc),inset 0 0 18px var(--acc);opacity:0;animation:pa-ring 10s ease-out both} .pa-tilt{position:relative;width:46%;aspect-ratio:.72;transform:rotate(-9deg);transform-style:preserve-3d} .pa-item{position:absolute;inset:0;transform-style:preserve-3d;animation:pa-item 10s ease-in-out both} .pa-face{position:absolute;inset:0;border-radius:11px;padding:3px;overflow:hidden;box-shadow:0 12px 26px rgba(0,0,0,.6),0 0 16px color-mix(in srgb,var(--acc) 60%,transparent)} .pa-front{animation:pa-front 10s linear both} .pa-back{transform:rotateY(180deg);animation:pa-backf 10s linear both} .pa-back .pa-in{background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--acc) 70%,#000) 0 6px,color-mix(in srgb,var(--acc) 55%,#000) 6px 12px);color:#fff} .pa-back .pa-in::before{display:none} .pa-back .pa-icon{margin-top:0;width:56%;height:56%} .pa-holo{position:absolute;inset:-40%;background:conic-gradient(#ff6ad5,#ffd36a,#6affb0,#6ad5ff,#b06aff,#ff6ad5);animation:pa-holo 2.6s linear infinite} .pa-in{position:relative;width:100%;height:100%;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#0b0a12;  background:linear-gradient(160deg,color-mix(in srgb,var(--acc) 85%,#fff) 0%,var(--acc) 40%,color-mix(in srgb,var(--acc) 50%,#000) 100%)} .pa-in::before{content:"";position:absolute;left:8%;right:8%;top:6%;height:15%;border-radius:5px;background:rgba(255,255,255,.85)} .pa-foil{position:absolute;inset:0;background:repeating-linear-gradient(120deg,rgba(255,0,170,.0) 0 6px,rgba(255,120,220,.35) 9px,rgba(120,255,200,.35) 14px,rgba(120,180,255,.35) 19px,rgba(255,0,170,0) 24px);mix-blend-mode:overlay;background-size:200% 200%;animation:pa-foil 10s linear both} .pa-in::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.8) 47%,transparent 60%);transform:translateX(-130%);animation:pa-shine 10s ease-in-out both} .pa-icon{position:relative;margin-top:16%;width:44%;height:44%} .pa-orb{position:absolute;width:26%;aspect-ratio:1;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:rgba(0,0,0,.75);  background:radial-gradient(circle at 32% 28%,#fff 0 8%,color-mix(in srgb,var(--acc) 70%,#fff) 18%,var(--acc) 48%,color-mix(in srgb,var(--acc) 45%,#000) 100%);  box-shadow:0 6px 14px rgba(0,0,0,.5),0 0 14px color-mix(in srgb,var(--acc) 70%,transparent);opacity:0;animation:pa-orb 10s ease-in-out both} .pa-orb svg{width:50%;height:50%} .pa-orb.o1{top:9%;right:6%} .pa-orb.o2{bottom:8%;left:5%;width:22%;animation-name:pa-orb2} .pa-sp{position:absolute;width:11px;height:11px;background:#fff;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);filter:drop-shadow(0 0 3px var(--acc));opacity:0;animation:pa-sp 1.8s ease-in-out infinite} .pa-sp.s1{top:16%;left:14%;animation-delay:.2s}.pa-sp.s2{top:58%;right:12%;animation-delay:.9s;width:8px;height:8px}.pa-sp.s3{bottom:16%;right:34%;animation-delay:1.4s}.pa-sp.s4{top:30%;left:62%;animation-delay:.55s;width:7px;height:7px} @keyframes pa-item{0%{transform:scale(.4) rotateY(-90deg);opacity:0}8%{transform:scale(1.1) rotateY(0);opacity:1}12%{transform:scale(1) rotateY(0)}18%{transform:rotateY(-12deg) rotateX(4deg)}24%{transform:rotateY(0);animation-timing-function:linear}46%{transform:rotateY(360deg)}52%{transform:rotateY(372deg) rotateX(-4deg)}58%{transform:rotateY(360deg);animation-timing-function:linear}82%{transform:rotateY(720deg)}88%{transform:scale(1.1) rotateY(720deg)}94%,100%{transform:scale(1) rotateY(720deg);opacity:1}} @keyframes pa-front{0%,29.4%{opacity:1}29.6%,40.4%{opacity:0}40.6%,63.9%{opacity:1}64.1%,75.9%{opacity:0}76.1%,100%{opacity:1}} @keyframes pa-backf{0%,29.4%{opacity:0}29.6%,40.4%{opacity:1}40.6%,63.9%{opacity:0}64.1%,75.9%{opacity:1}76.1%,100%{opacity:0}} @keyframes pa-holo{to{transform:rotate(360deg)}} @keyframes pa-foil{from{background-position:0% 0%}to{background-position:200% 200%}} @keyframes pa-orb{0%,8%{opacity:0;transform:translateY(8px) scale(.6)}16%{opacity:1;transform:translateY(0) scale(1)}35%{transform:translateY(-5px)}55%{transform:translateY(2px)}75%{transform:translateY(-4px)}100%{opacity:1;transform:translateY(0)}} @keyframes pa-orb2{0%,12%{opacity:0;transform:translateY(-8px) scale(.6)}20%{opacity:1;transform:translateY(0) scale(1)}40%{transform:translateY(4px)}60%{transform:translateY(-3px)}80%{transform:translateY(3px)}100%{opacity:1;transform:translateY(0)}} @keyframes pa-sp{0%,100%{opacity:0;transform:scale(.3) rotate(0)}50%{opacity:1;transform:scale(1) rotate(45deg)}} @keyframes pa-hex{from{transform:rotate(0) scale(1)}to{transform:rotate(30deg) scale(1.08)}} @keyframes pa-ring{0%{transform:scale(.35);opacity:0}4%{opacity:1}22%{transform:scale(1.35);opacity:0}78%{transform:scale(.35);opacity:0}80%{opacity:1}97%{transform:scale(1.35);opacity:0}100%{opacity:0}} @keyframes pa-rays{0%{opacity:0;transform:rotate(0)}6%{opacity:1}24%{opacity:0;transform:rotate(40deg)}78%{opacity:0}82%{opacity:1}98%{opacity:0;transform:rotate(120deg)}100%{opacity:0}} @keyframes pa-glow{0%{opacity:0}7%{opacity:.85}30%{opacity:.3}78%{opacity:.3}82%{opacity:.85}100%{opacity:.35}} @keyframes pa-shine{0%,30%{transform:translateX(-130%)}42%{transform:translateX(130%)}43%,58%{transform:translateX(-130%)}68%{transform:translateX(130%)}100%{transform:translateX(130%)}} @media (prefers-reduced-motion:reduce){.pa *,.pa *::after{animation:none!important}.pa-item,.pa-orb{opacity:1}.pa-back{display:none}} `}</style>
    </div>
  );
}
