"use client";

/**
 * Animations plein écran à l'arrivée sur OM (style Pump.fun, dans l'univers OM) :
 *  1. Bonbons reçus depuis la dernière visite : pluie de bonbons et carte « Tu as reçu… »
 *  2. Omero gagnés depuis la dernière visite : pièces qui jaillissent puis filent vers le haut, compteur qui monte
 *  3. Nouveau niveau atteint : badge géant, rayons qui tournent, confettis de la couleur du niveau, avantages débloqués
 * Pendant la visite, une vérification toutes les 2 minutes relance les animations 1 et 2 pour les gains en direct.
 * Le dernier passage (date et niveau) est gardé sur l'appareil, par portefeuille.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { BonbonCount, BonbonIcon } from "@/components/shared/bonbon-icon";
import { levelPerks } from "@/lib/level-perks";
import { frameOfLevel } from "@/lib/level-perks";

type Data = { now: string; level: number; total: number; tips: { count: number; amount: number; senders: number; from: { wallet: string; name: string | null; avatar: string | null }[] }; gained: number };
type Show = { kind: "bonbons"; d: Data } | { kind: "omero"; amount: number } | { kind: "level"; level: number };

const LEVELS = [
  { label: "Blue", badge: "blue", color: "#3B82F6" },
  { label: "Green", badge: "green", color: "#22C55E" },
  { label: "Yellow", badge: "yellow", color: "#EAB308" },
  { label: "Orange", badge: "orange", color: "#F97316" },
  { label: "Red", badge: "red", color: "#F43F5E" },
];
const key = (w: string) => `om-celebrate:${w}`;
const n = (x: number) => Math.round(x).toLocaleString("en-US");
/** Nombre pseudo-aléatoire stable (mêmes positions à chaque rendu) */
const rnd = (i: number, s = 1) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

function Counter({ to, ms = 1400 }: { to: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / ms); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{n(v)}</>;
}

export function Celebrations() {
  const { walletAddress } = useAuth();
  const { tr } = useT();
  const [queue, setQueue] = useState<Show[]>([]);
  const busy = useRef(false);

  const check = useCallback(async (w: string, first: boolean) => {
    if (busy.current) return;
    busy.current = true;
    try {
      let prev: { at: string; level: number } | null = null;
      try { prev = JSON.parse(localStorage.getItem(key(w)) ?? "null"); } catch { /* sans effet */ }
      const since = prev?.at ?? new Date().toISOString();
      const r = await fetch(`/api/celebrations?since=${encodeURIComponent(since)}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as Data;
      const next: Show[] = [];
      if (prev) {
        if (d.tips.count > 0 && d.tips.amount >= 10) next.push({ kind: "bonbons", d });
        if (d.gained >= 1) next.push({ kind: "omero", amount: d.gained });
        if (d.level > prev.level && d.level >= 0) next.push({ kind: "level", level: d.level });
      }
      try { localStorage.setItem(key(w), JSON.stringify({ at: d.now, level: Math.max(d.level, prev?.level ?? -1) })); } catch { /* sans effet */ }
      if (next.length) setQueue((q) => [...q, ...next]);
      void first;
    } catch { /* sans effet */ } finally { busy.current = false; }
  }, []);

  useEffect(() => {
    if (!walletAddress) return;
    const t = setTimeout(() => check(walletAddress, true), 1800);
    const id = setInterval(() => { if (document.visibilityState === "visible") check(walletAddress, false); }, 120_000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [walletAddress, check]);

  const cur = queue[0];
  const close = () => setQueue((q) => q.slice(1));
  useEffect(() => {
    if (!cur) return;
    const t = setTimeout(close, cur.kind === "level" ? 9000 : 5200);
    return () => clearTimeout(t);
  }, [cur]);
  if (!cur) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-black/55 backdrop-blur-[2px] cel-fade" onClick={close} role="dialog" aria-modal="true">
      {cur.kind === "bonbons" && (
        <>
          {/* Pluie de bonbons */}
          {Array.from({ length: 26 }, (_, i) => (
            <span key={i} className="cel-fall pointer-events-none absolute top-0" style={{ left: `${rnd(i) * 100}%`, animationDelay: `${rnd(i, 2) * 1.6}s`, animationDuration: `${2.2 + rnd(i, 3) * 1.6}s`, ["--rot" as string]: `${(rnd(i, 4) - .5) * 720}deg` }}>
              <BonbonIcon kind={rnd(i, 5) > .65 ? "orange" : "white"} className="h-12" />
            </span>
          ))}
          <div className="cel-pop relative mx-6 w-full max-w-sm rounded-[28px] bg-background p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center"><BonbonIcon kind="orange" className="cel-wobble h-20" /></div>
            <p className="mt-3 text-[22px] font-extrabold">{tr("You received bonbons!")}</p>
            <div className="mt-3 flex justify-center"><BonbonCount amount={cur.d.tips.amount} className="h-9" /></div>
            <p className="num mt-2 text-[15px] font-bold">+<Counter to={cur.d.tips.amount} /> OMERO</p>
            {cur.d.tips.from.length > 0 && (
              <p className="mt-2 text-[13px] text-muted-foreground">
                {tr("From {names}", { names: cur.d.tips.from.map((f) => f.name ?? `${f.wallet.slice(0, 4)}…${f.wallet.slice(-4)}`).join(", ") + (cur.d.tips.senders > cur.d.tips.from.length ? ` +${cur.d.tips.senders - cur.d.tips.from.length}` : "") })}
              </p>
            )}
            <button onClick={close} className="mt-5 h-12 w-full rounded-2xl bg-foreground text-[15px] font-bold text-background">{tr("Nice!")}</button>
          </div>
        </>
      )}

      {cur.kind === "omero" && (
        <>
          {/* Pièces qui jaillissent du centre puis filent vers le solde, en haut */}
          {Array.from({ length: 18 }, (_, i) => {
            const a = (i / 18) * Math.PI * 2;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src="/omero-coin-3d.png" alt="" className="cel-coin pointer-events-none absolute left-1/2 top-1/2 size-11 object-contain"
                style={{ ["--bx" as string]: `${Math.cos(a) * (90 + rnd(i) * 70)}px`, ["--by" as string]: `${Math.sin(a) * (90 + rnd(i, 2) * 70)}px`, animationDelay: `${rnd(i, 3) * .25}s` }} />
            );
          })}
          <div className="cel-pop relative text-center text-white" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/omero-coin-3d.png" alt="" className="cel-spin mx-auto size-28 object-contain drop-shadow-[0_14px_30px_rgba(0,0,0,.45)]" />
            <p className="num mt-4 text-[44px] font-extrabold leading-none tracking-tight">+<Counter to={cur.amount} /></p>
            <p className="mt-1 text-[16px] font-bold opacity-90">OMERO</p>
            <p className="mt-2 text-[13px] opacity-80">{tr("Earned since your last visit")}</p>
          </div>
        </>
      )}

      {cur.kind === "level" && (() => {
        const L = LEVELS[Math.min(4, cur.level)];
        const frame = frameOfLevel(L.label);
        return (
          <>
            {/* Rayons qui tournent derrière le badge */}
            <div className="cel-rays pointer-events-none absolute left-1/2 top-[38%] size-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `repeating-conic-gradient(from 0deg, ${L.color}55 0deg 10deg, transparent 10deg 20deg)`, maskImage: "radial-gradient(circle, #000 20%, transparent 65%)", WebkitMaskImage: "radial-gradient(circle, #000 20%, transparent 65%)" }} />
            {/* Confettis */}
            {Array.from({ length: 40 }, (_, i) => (
              <span key={i} className="cel-confetti pointer-events-none absolute top-0 block h-3 w-2 rounded-[2px]"
                style={{ left: `${rnd(i, 7) * 100}%`, background: i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? L.color : "#ffd84a", animationDelay: `${rnd(i, 8) * 1.2}s`, animationDuration: `${2.4 + rnd(i, 9) * 1.8}s`, ["--rot" as string]: `${(rnd(i, 10) - .5) * 1080}deg` }} />
            ))}
            <div className="relative mx-6 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/badges/omero-${L.badge}.png`} alt="" className="cel-badge mx-auto size-32 drop-shadow-[0_10px_30px_rgba(0,0,0,.45)]" />
              <p className="cel-pop mt-4 text-[13px] font-bold uppercase tracking-[.2em] text-white/80">{tr("New level")}</p>
              <p className="cel-pop text-[40px] font-extrabold leading-tight text-white" style={{ animationDelay: ".15s" }}>{tr("Level {name}", { name: tr(L.label) })}</p>
              <div className="cel-pop mt-4 space-y-2 rounded-[24px] bg-background p-4 text-left" style={{ animationDelay: ".3s" }}>
                {levelPerks(cur.level).slice(0, 4).map((pk) => (
                  <p key={pk.title} className="text-[14px] font-bold">{tr(pk.title, { level: tr(L.label), frame: tr(frame?.name ?? ""), ...pk.vars })}</p>
                ))}
                <button onClick={close} className="mt-2 h-12 w-full rounded-2xl bg-foreground text-[15px] font-bold text-background">{tr("Let's go")}</button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
