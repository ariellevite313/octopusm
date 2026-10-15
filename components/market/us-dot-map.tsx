"use client";

import { US_DOTS, US_H, US_STEP, US_W } from "@/lib/us-dots";
import type { PmStateLean } from "@/lib/polymarket";

const BLUE: [number, number, number] = [59, 130, 246];
const PURPLE: [number, number, number] = [168, 85, 247];
const RED: [number, number, number] = [239, 68, 68];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function leanColor(l: PmStateLean | undefined): string {
  if (!l) return "var(--muted-foreground)";
  const t = l.dem + l.rep > 0 ? l.dem / (l.dem + l.rep) : 0.5; // 1 = démocrate, 0 = républicain
  const c = t >= 0.5 ? mix(PURPLE, BLUE, (t - 0.5) * 2) : mix(PURPLE, RED, (0.5 - t) * 2);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Carte des États-Unis en points, colorée selon le favori de chaque course (données Polymarket). */
export function UsDotMap({ leans, className = "" }: { leans: Record<string, PmStateLean>; className?: string }) {
  const r = US_STEP * 0.36;
  return (
    <svg viewBox={`${-r} ${-r} ${US_W + 2 * r} ${US_H + 2 * r}`} className={className} role="img" aria-label="US map">
      {Object.entries(US_DOTS).map(([code, pts]) => {
        const l = leans[code];
        const circles = [];
        for (let i = 0; i < pts.length; i += 2) circles.push(<circle key={i} cx={pts[i]} cy={pts[i + 1]} r={r} />);
        return (
          <g key={code} fill={leanColor(l)} opacity={l ? 1 : 0.22}>
            {l && <title>{`${code}: ${Math.round(l.dem * 100)}% D · ${Math.round(l.rep * 100)}% R`}</title>}
            {circles}
          </g>
        );
      })}
    </svg>
  );
}
