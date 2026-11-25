"use client";

/** Tutoriel de bienvenue : 8 écrans, montré une seule fois à la première connexion du compte (le choix est gardé sur l'appareil). */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { CandlestickChart, ChevronLeft, ChevronRight, Gift, Hash, Rocket, Sparkles, TrendingUp, Trophy, X } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";
import { BonbonIcon } from "@/components/shared/bonbon-icon";

const AGE_KEY = "om_age_ok_v1";
const seenKey = (w: string) => `om_tour_v1_${w}`;
const read = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const save = (k: string) => { try { localStorage.setItem(k, "1"); } catch { /* stockage indisponible */ } };

type Slide = { icon: React.ReactNode; title: string; text: string };
const ICON = "size-14";

export const TOUR_SLIDES: Slide[] = [
  { icon: <Sparkles className={ICON} />, title: T("Welcome to OMdot.fun"), text: T("Predict, launch tokens, trade and earn OMERO in one place. Here is a 1 minute tour.") },
  { icon: <Hash className={ICON} />, title: T("Feed and communities"), text: T("Post, reply and follow people. Join communities around a token or a topic. Every token has its own feed.") },
  { icon: <TrendingUp className={ICON} />, title: T("Predict"), text: T("Pick an outcome on a market, a pool or an Up/Down round and stake USDC. If you are right, you share the pool.") },
  { icon: <Rocket className={ICON} />, title: T("Launchpad"), text: T("Launch your own token on Solana or Arc in a few minutes, and collect the trading fees it earns.") },
  { icon: <CandlestickChart className={ICON} />, title: T("Terminal"), text: T("Trade on Solana, Arc and 7 other chains with a pro chart, limit orders and security checks on every token.") },
  { icon: <Sparkles className={ICON} />, title: T("Janus, your AI"), text: T("Connect Claude or another AI to your account. Janus can read the market, post, and trade within the limits you set.") },
  { icon: <Gift className={ICON} />, title: T("OMERO and bonbons"), text: T("Every action earns OMERO. Send tips with bonbons: a white bonbon is 10 OMERO, an orange bonbon is 100 OMERO. Each week the top 10 are rewarded.") },
  { icon: <Trophy className={ICON} />, title: T("Hackathon and ambassadors"), text: T("Enter the builders hackathon before December 15, or become an ambassador and earn by bringing people in. You are ready.") },
];

export function WelcomeTutorial() {
  const { tr } = useT();
  const pathname = usePathname();
  const { walletAddress, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !walletAddress || read(seenKey(walletAddress))) return;
    const t = setTimeout(() => { if (read(AGE_KEY) && !read(seenKey(walletAddress))) setOpen(true); }, 1800);
    return () => clearTimeout(t);
  }, [isAuthenticated, walletAddress]);

  if (!open || !walletAddress || typeof document === "undefined" || pathname === "/policy" || pathname === "/privacy" || pathname.startsWith("/phantom-callback")) return null;
  const close = () => { save(seenKey(walletAddress)); setOpen(false); };
  const s = TOUR_SLIDES[i], last = i === TOUR_SLIDES.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={tr("Welcome tour")}>
      <div className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-[28px] border border-border bg-card p-6 text-center shadow-2xl">
        <button onClick={close} aria-label={tr("Skip")} className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        <div className="mt-4 flex h-24 items-center justify-center text-foreground">
          {i === 6 ? <span className="flex items-end gap-3"><BonbonIcon kind="white" className="h-20" /><BonbonIcon kind="orange" className="h-20" /></span> : s.icon}
        </div>
        <p className="mt-3 text-[22px] font-bold leading-tight text-foreground">{tr(s.title)}</p>
        <p className="mt-2 min-h-[96px] text-[15px] leading-relaxed text-muted-foreground">{tr(s.text)}</p>
        <div className="my-4 flex justify-center gap-1.5" aria-hidden>
          {TOUR_SLIDES.map((_, n) => <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-foreground" : "w-1.5 bg-muted-foreground/30"}`} />)}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} aria-label={tr("Back")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-30"><ChevronLeft className="size-5" /></button>
          <button onClick={() => (last ? close() : setI(i + 1))} className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-foreground text-[16px] font-bold text-background">
            {last ? tr("Start") : <>{tr("Next")}<ChevronRight className="size-4" /></>}
          </button>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">{i + 1} / {TOUR_SLIDES.length}</p>
      </div>
    </div>,
    document.body,
  );
}
