"use client";

import { useEffect, useRef } from "react";

/**
 * Défilement horizontal automatique et continu d'un conteneur dont les `total` premiers enfants
 * sont dupliqués juste après (boucle sans à-coup). Pause au toucher / survol / molette ;
 * le glissé manuel reste possible. Renvoie la ref à poser sur le conteneur (overflow-x: auto).
 */
export function useAutoMarquee(total: number, enabled = true, speed = 38) {
  const scroller = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !enabled || total < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, pos = el.scrollLeft, last = performance.now(), resume: ReturnType<typeof setTimeout> | undefined;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64); last = now;
      const dup = el.children[total] as HTMLElement | undefined;
      const half = dup ? dup.offsetLeft - (el.children[0] as HTMLElement).offsetLeft : 0;
      if (!paused.current && half > el.clientWidth) {
        pos += (speed * dt) / 1000;
        if (pos >= half) pos -= half;
        el.scrollLeft = pos;
      } else {
        pos = el.scrollLeft;
      }
      raf = requestAnimationFrame(tick);
    };
    const hold = () => { paused.current = true; if (resume) clearTimeout(resume); };
    const release = () => { if (resume) clearTimeout(resume); resume = setTimeout(() => { paused.current = false; }, 1800); };
    const onWheel = () => { hold(); release(); };
    el.addEventListener("pointerdown", hold);
    el.addEventListener("pointerenter", hold);
    el.addEventListener("pointerleave", release);
    el.addEventListener("pointerup", release);
    el.addEventListener("touchend", release);
    el.addEventListener("wheel", onWheel, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf); if (resume) clearTimeout(resume);
      el.removeEventListener("pointerdown", hold); el.removeEventListener("pointerenter", hold);
      el.removeEventListener("pointerleave", release); el.removeEventListener("pointerup", release);
      el.removeEventListener("touchend", release); el.removeEventListener("wheel", onWheel);
    };
  }, [enabled, total, speed]);

  return scroller;
}
