"use client";

/**
 * Tutoriel de bienvenue : 8 écrans en « stories » (barres de progression en haut, défilement automatique),
 * montré une seule fois à la première connexion du compte (le choix est gardé sur l'appareil).
 * Chaque écran : une grande carte colorée avec une illustration faite des éléments d'OM, puis titre, texte et boutons.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Award, CandlestickChart, Clock, Gift, Hash, Heart, MessageCircle, Rocket, Sparkles, TrendingUp, X } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT, Tr } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";
import { BonbonIcon } from "@/components/shared/bonbon-icon";

const AGE_KEY = "om_age_ok_v1";
const seenKey = (w: string) => `om_tour_v1_${w}`;
const read = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const save = (k: string) => { try { localStorage.setItem(k, "1"); } catch { /* stockage indisponible */ } };
const DURATION = 6500;

/* ── Petits éléments des illustrations (cartes sombres, comme l'app) ── */
const Panel = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-[18px] bg-[#16161c] text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] ${className}`}>{children}</div>
);
const Bar = ({ w = "w-14" }: { w?: string }) => <span className={`block h-2 ${w} rounded-full bg-white/15`} />;
function Row({ logo, name, sub, up = true, round = true }: { logo: string; name: string; sub: string; up?: boolean | null; round?: boolean }) {
  return (
    <Panel className="flex items-center gap-3 px-3.5 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt="" className={`size-10 shrink-0 object-cover ${round ? "rounded-full" : "rounded-xl"}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{name}</p>
        <p className="mt-1 flex items-center gap-2"><Bar /><span className={`num text-[12px] font-semibold ${up === null ? "text-white/60" : up ? "text-[#4ade80]" : "text-[#f87171]"}`}>{sub}</span></p>
      </div>
      <Bar w="w-12" />
    </Panel>
  );
}
/** Image flottante décorative (pièces, bonbons, logos) */
const Float = ({ src, className }: { src: string; className: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src} alt="" aria-hidden className={`pointer-events-none absolute drop-shadow-[0_8px_16px_rgba(0,0,0,0.25)] ${className}`} />
);

type Slide = { bg: string; icon: React.ReactNode; title: string; text: string; art: React.ReactNode };
const ICO = "size-9 text-black";

export const TOUR_SLIDES: Slide[] = [
  {
    bg: "#ffe94d", icon: <Sparkles className={ICO} strokeWidth={2.4} />,
    title: T("Welcome to OMdot.fun"), text: T("Predict, launch tokens, trade and earn OMERO in one place. Here is a 1 minute tour."),
    art: (
      <div className="relative mx-auto w-[78%] space-y-2">
        <Panel className="px-4 pb-4 pt-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/octo-coin.png" alt="" className="size-8 rounded-full" />
            <span className="text-[14px] font-semibold">OMdotfun</span>
          </div>
          <div className="mt-6"><Bar w="w-20" /></div>
          <p className="num mt-2 text-[30px] font-extrabold leading-none">12,480</p>
          <p className="num mt-1 text-[13px] text-white/70">OMERO</p>
        </Panel>
        <Row logo="/solana.png" name="Solana" sub="+12.24%" />
        <Row logo="/usdc-coin.png" name="USD Coin" sub="0.00%" up={null} />
        <Float src="/bonbon-orange.png" className="-right-8 -top-6 h-20 rotate-12" />
        <Float src="/bonbon-white.png" className="-left-9 bottom-2 h-16 -rotate-12" />
      </div>
    ),
  },
  {
    bg: "#8fa8ff", icon: <Hash className={ICO} strokeWidth={2.6} />,
    title: T("Feed and communities"), text: T("Post, reply and follow people. Join communities around a token or a topic. Every token has its own feed."),
    art: (
      <div className="relative mx-auto w-[80%] space-y-2">
        <Panel className="p-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/octo-coin.png" alt="" className="size-9 rounded-full" />
            <div><p className="text-[14px] font-bold">Omero</p><Bar w="w-16" /></div>
          </div>
          <p className="mt-3 text-[14px] leading-snug text-white/90">$OMERO community is live. Who is in?</p>
          <div className="mt-3 flex items-center gap-5 text-[13px] text-white/70">
            <span className="flex items-center gap-1.5"><Heart className="size-4" />248</span>
            <span className="flex items-center gap-1.5"><MessageCircle className="size-4" />36</span>
            <span className="flex items-center gap-1"><BonbonIcon kind="orange" className="h-6" /><span className="num">×4</span></span>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 px-3.5 py-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-[16px] font-bold">#</span>
          <div className="flex-1"><p className="text-[15px] font-semibold"><Tr>Solana memes</Tr></p><p className="num text-[12px] text-white/60">12.4K</p></div>
          <span className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-black">Join</span>
        </Panel>
        <Float src="/doge.png" className="-right-7 -top-7 size-16 rounded-full rotate-6" />
      </div>
    ),
  },
  {
    bg: "#ffa6e6", icon: <TrendingUp className={ICO} strokeWidth={2.6} />,
    title: T("Predict"), text: T("Pick an outcome on a market, a pool or an Up/Down round and stake USDC. If you are right, you share the pool."),
    art: (
      <div className="relative mx-auto w-[80%]">
        <Panel className="p-4">
          <p className="text-[15px] font-bold leading-snug">Will SOL close above $250 this Friday?</p>
          {[["Yes", 64], ["No", 36]].map(([l, p]) => (
            <div key={l as string} className="mt-3">
              <div className="flex justify-between text-[13px] font-semibold"><span>{l}</span><span className="num">{p}%</span></div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-white" style={{ width: `${p}%` }} /></div>
            </div>
          ))}
        </Panel>
        <Panel className="absolute -bottom-12 right-[-8%] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Pool</p>
          <p className="num text-[22px] font-extrabold">$4,820</p>
        </Panel>
        <Float src="/usdc-coin.png" className="-left-8 -top-8 size-16 rounded-full -rotate-12" />
      </div>
    ),
  },
  {
    bg: "#ff9a3d", icon: <Rocket className={ICO} strokeWidth={2.6} />,
    title: T("Launchpad"), text: T("Launch your own token on Solana or Arc in a few minutes, and collect the trading fees it earns."),
    art: (
      <div className="relative mx-auto w-[80%]">
        <Panel className="p-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/octo-coin.png" alt="" className="size-14 rounded-2xl" />
            <div><p className="text-[17px] font-extrabold">$OMERO</p><p className="text-[12px] text-white/60">Omero Inu</p></div>
          </div>
          <div className="mt-4 flex justify-between text-[12px] text-white/70"><span><Tr>Bonding curve</Tr></span><span className="num">72%</span></div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-[72%] rounded-full bg-[#ff9a3d]" /></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/5 p-2.5"><p className="text-[11px] text-white/60"><Tr>Market cap</Tr></p><p className="num text-[15px] font-bold">$1.25M</p></div>
            <div className="rounded-xl bg-white/5 p-2.5"><p className="text-[11px] text-white/60"><Tr>Your fees</Tr></p><p className="num text-[15px] font-bold text-[#4ade80]">+$842</p></div>
          </div>
        </Panel>
        <Float src="/solana.png" className="-right-7 -top-7 size-14 rounded-full rotate-12" />
        <Float src="/chains/arc.png" className="-bottom-6 -left-6 size-14 rounded-full -rotate-6" />
      </div>
    ),
  },
  {
    bg: "#cdd982", icon: <CandlestickChart className={ICO} strokeWidth={2.4} />,
    title: T("Terminal"), text: T("Trade on Solana, Arc and 7 other chains with a pro chart, limit orders and security checks on every token."),
    art: (
      <div className="relative mx-auto w-[80%] space-y-2">
        <Row logo="/solana.png" name="Solana" sub="+12.24%" />
        <Row logo="/apple.png" name="AAPLx" sub="+1.25%" />
        <Row logo="/nvidia.png" name="NVDAx" sub="+3.68%" />
        <Row logo="/octo-coin.png" name="OMERO" sub="+24.10%" />
        <Float src="/bitcoin.png" className="-right-7 -top-8 size-16 rounded-full rotate-12" />
        <Float src="/ethereum.png" className="-bottom-6 -left-7 size-14 rounded-full" />
      </div>
    ),
  },
  {
    bg: "#c9cad6", icon: <Sparkles className={ICO} strokeWidth={2.4} />,
    title: T("Janus, your AI"), text: T("Connect Claude or another AI to your account. Janus can read the market, post, and trade within the limits you set."),
    art: (
      <div className="relative mx-auto w-[80%] space-y-2.5">
        <div className="ml-auto w-fit max-w-[80%] rounded-[18px] rounded-br-md bg-white px-4 py-2.5 text-[14px] font-semibold text-black shadow">Buy $20 of OMERO</div>
        <Panel className="w-fit max-w-[88%] rounded-bl-md px-4 py-3">
          <p className="text-[12px] font-bold text-white/60">Janus</p>
          <p className="mt-1 text-[14px]">Done. 18,420 OMERO bought. Limit left today: $180.</p>
        </Panel>
        <div className="ml-auto w-fit rounded-[18px] rounded-br-md bg-white px-4 py-2.5 text-[14px] font-semibold text-black shadow">Set a stop loss at -20%</div>
        <Float src="/agents/claude.png" className="-left-7 -top-9 size-14 rounded-2xl -rotate-6" />
      </div>
    ),
  },
  {
    bg: "#ffd8a8", icon: <Gift className={ICO} strokeWidth={2.4} />,
    title: T("OMERO and bonbons"), text: T("Every action earns OMERO. Send tips with bonbons: a white bonbon is 10 OMERO, an orange bonbon is 100 OMERO. Each week the top 10 are rewarded."),
    art: (
      <div className="relative mx-auto flex w-[80%] items-end justify-center gap-4">
        <div className="flex flex-col items-center"><BonbonIcon kind="white" className="h-44" /><span className="num mt-1 rounded-full bg-black px-3 py-1 text-[13px] font-bold text-white">10 OMERO</span></div>
        <div className="flex flex-col items-center"><BonbonIcon kind="orange" className="h-52" /><span className="num mt-1 rounded-full bg-black px-3 py-1 text-[13px] font-bold text-white">100 OMERO</span></div>
        <Float src="/octo-coin.png" className="-right-4 -top-6 size-14 rounded-full rotate-12" />
      </div>
    ),
  },
  {
    bg: "#b8a6ff", icon: <Award className={ICO} strokeWidth={2.4} />,
    title: T("Hackathon and ambassadors"), text: T("Enter the builders hackathon before December 15, or become an ambassador and earn by bringing people in. You are ready."),
    art: (
      <div className="relative mx-auto w-[80%] space-y-2">
        <Panel className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60"><Tr>OM Builders Hackathon</Tr></p>
          <p className="num mt-1 text-[30px] font-extrabold leading-none">$100,000</p>
          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {[["20", "days"], ["10", "hours"], ["39", "min"], ["44", "sec"]].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-white/5 py-2 text-center"><p className="num text-[18px] font-extrabold">{v}</p><p className="text-[10px] text-white/60">{l}</p></div>
            ))}
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 px-3.5 py-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-white text-[13px] font-extrabold text-black">20%</span>
          <div><p className="text-[15px] font-semibold"><Tr>Ambassador</Tr></p><p className="text-[12px] text-white/60">of the fees on your referrals</p></div>
        </Panel>
        <Float src="/bonbon-orange.png" className="-right-6 -top-10 h-20 rotate-12" />
      </div>
    ),
  },
];

/** forceOpen : aperçu sans compte (outil de capture d'écran), rien n'est gardé. */
export function WelcomeTutorial({ forceOpen = false }: { forceOpen?: boolean } = {}) {
  const { tr } = useT();
  const pathname = usePathname();
  const { walletAddress, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(forceOpen);
  const [i, setI] = useState(0);
  const [tick, setTick] = useState(0); // relance l'animation de la barre en cours
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Déconnexion : le tutoriel se présentera de nouveau à la prochaine connexion
  const lastWallet = useRef<string | null>(null);
  useEffect(() => {
    if (isAuthenticated && walletAddress) { lastWallet.current = walletAddress; return; }
    if (!isAuthenticated && lastWallet.current) {
      try { localStorage.removeItem(seenKey(lastWallet.current)); } catch { /* stockage indisponible */ }
      lastWallet.current = null;
      setOpen(false); setI(0);
    }
  }, [isAuthenticated, walletAddress]);

  useEffect(() => {
    if (!isAuthenticated || !walletAddress || read(seenKey(walletAddress))) return;
    setI(0);
    const t = setTimeout(() => { if (read(AGE_KEY) && !read(seenKey(walletAddress))) setOpen(true); }, 1800);
    return () => clearTimeout(t);
  }, [isAuthenticated, walletAddress]);

  const last = i === TOUR_SLIDES.length - 1;
  // Défilement automatique, comme des stories ; le dernier écran attend la personne
  useEffect(() => {
    if (!open || last) return;
    timer.current = setTimeout(() => setI((n) => Math.min(n + 1, TOUR_SLIDES.length - 1)), DURATION);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [open, i, tick, last]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const who = walletAddress ?? (forceOpen ? "preview" : null);
  if (!open || !who || typeof document === "undefined" || pathname === "/policy" || pathname === "/privacy" || pathname.startsWith("/phantom-callback")) return null;
  const close = () => { if (!forceOpen) save(seenKey(who)); setOpen(false); };
  const go = (n: number) => { setI(Math.max(0, Math.min(TOUR_SLIDES.length - 1, n))); setTick((t) => t + 1); };
  const s = TOUR_SLIDES[i];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-center bg-background md:items-center md:bg-black/70 md:p-6 md:backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={tr("Welcome tour")}>
      <style>{`@keyframes omtour{from{width:0}to{width:100%}}`}</style>
      <div className="flex h-full w-full max-w-[440px] flex-col bg-background px-4 pb-5 pt-3 md:h-[860px] md:max-h-full md:rounded-[32px] md:border md:border-border">
        {/* Carte colorée : toucher à gauche = retour, à droite = suivant */}
        <div className="relative flex h-[58%] shrink-0 flex-col overflow-hidden rounded-[30px] px-5 pb-6 pt-4" style={{ background: s.bg }}>
          <div className="flex gap-1.5">
            {TOUR_SLIDES.map((_, n) => (
              <span key={n} className="h-[3px] flex-1 overflow-hidden rounded-full bg-black/15">
                {n < i && <span className="block h-full w-full bg-black" />}
                {n === i && <span key={`${i}-${tick}`} className="block h-full bg-black" style={last ? { width: "100%" } : { animation: `omtour ${DURATION}ms linear forwards` }} />}
              </span>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            {s.icon}
            <button onClick={close} aria-label={tr("Skip")} className="relative z-10 flex size-9 items-center justify-center rounded-full bg-black/10 text-black"><X className="size-5" /></button>
          </div>
          <div className="relative flex flex-1 items-center justify-center py-6">
            <div key={i} className="w-full animate-in fade-in zoom-in-95 duration-500">{s.art}</div>
          </div>
          <button aria-label={tr("Back")} onClick={() => go(i - 1)} className="absolute bottom-0 left-0 top-16 w-1/3" />
          <button aria-label={tr("Next")} onClick={() => (last ? undefined : go(i + 1))} className="absolute bottom-0 right-0 top-16 w-1/3" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-5 text-center">
          <p className="text-[26px] font-extrabold leading-tight tracking-tight text-foreground">{tr(s.title)}</p>
          <p className="mx-auto mt-2.5 max-w-[360px] text-[16px] leading-relaxed text-muted-foreground">{tr(s.text)}</p>
        </div>
        <div className="mt-3 shrink-0 space-y-2.5">
          <button onClick={() => (last ? close() : go(i + 1))} className="h-14 w-full rounded-full bg-foreground text-[17px] font-bold text-background">{last ? tr("Start") : tr("Next")}</button>
          <button onClick={close} className={`h-14 w-full rounded-full bg-muted text-[17px] font-bold text-foreground ${last ? "invisible" : ""}`}>{tr("Skip the tour")}</button>
        </div>
        <p className="mt-3 flex shrink-0 items-center justify-center gap-1.5 text-[14px] text-muted-foreground"><Clock className="size-4" />{tr("Less than a minute")}</p>
      </div>
    </div>,
    document.body,
  );
}
