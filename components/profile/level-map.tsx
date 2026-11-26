"use client";

/**
 * Carte au trésor des niveaux Omero : une île flottante par niveau (falaises en strates, herbe, décor et trésor),
 * reliées par un chemin en pointillés avec des étapes. Chaque île porte la puce de son niveau.
 * On touche une île : ses avantages sur la plateforme s'affichent sous la carte.
 * Dessin original en SVG (pas d'image externe).
 */
import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";
import { useT } from "@/lib/i18n";
import { frameOfLevel, levelPerks } from "@/lib/level-perks";

type Level = { label: string; min: number; max: number | null; color: string; count: number };

const BADGE: Record<string, string> = { Blue: "blue", Green: "green", Yellow: "yellow", Orange: "orange", Red: "red" };
const n = (x: number) => Math.round(x).toLocaleString("en-US");

/** Position de chaque île (de bas en haut, en zigzag) */
const SPOTS = [{ x: 96, y: 618 }, { x: 262, y: 504 }, { x: 98, y: 388 }, { x: 262, y: 270 }, { x: 140, y: 112 }];
/** Teintes de chaque île : herbe (clair, foncé), falaise (3 strates) */
const PAL = [
  { g1: "#e6f6ff", g2: "#9fd3f5", r: ["#9cc3e0", "#6f97b8", "#4d7394"] },
  { g1: "#8fe07a", g2: "#43a047", r: ["#b08455", "#8a6239", "#634424"] },
  { g1: "#c8e86a", g2: "#7cb342", r: ["#c79a5b", "#9c7238", "#6e4e22"] },
  { g1: "#f7c27a", g2: "#e08a3c", r: ["#c06a3a", "#94482a", "#69301c"] },
  { g1: "#7fe08a", g2: "#2e9e5b", r: ["#9b7b63", "#73563f", "#4f3826"] },
];

/** Falaise en strates + dessus herbeux (île de base, environ 130 × 90) */
function Isle({ p }: { p: (typeof PAL)[number] }) {
  return (
    <g>
      <path d="M-62 0 L-56 22 L-44 40 L-28 56 L-10 66 L8 64 L26 54 L42 38 L54 22 L62 0 Z" fill={p.r[0]} />
      <path d="M-56 22 L-44 40 L-28 56 L-10 66 L8 64 L26 54 L42 38 L54 22 L40 30 L22 34 L2 30 L-18 34 L-38 28 Z" fill={p.r[1]} />
      <path d="M-28 56 L-10 66 L8 64 L26 54 L14 52 L-2 56 L-16 52 Z" fill={p.r[2]} />
      <path d="M-40 12 L-34 26 M-6 18 L-2 34 L-8 44 M24 14 L30 30 M44 10 L40 20" stroke="#000" strokeOpacity=".18" strokeWidth="1.5" fill="none" />
      <ellipse cx="-20" cy="20" rx="5" ry="3" fill="#fff" opacity=".18" />
      <ellipse cx="0" cy="0" rx="64" ry="20" fill={p.g2} />
      <ellipse cx="0" cy="-3" rx="60" ry="17" fill={p.g1} />
      <path d="M-60 2 Q -54 10 -46 4 Q -40 12 -32 6 Q -26 12 -18 7 M18 8 Q 26 13 32 6 Q 40 12 46 4 Q 52 10 60 2" stroke={p.g2} strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="-14" cy="-8" rx="22" ry="5" fill="#fff" opacity=".18" />
    </g>
  );
}

/** Coffre ouvert avec son contenu (gemmes, or, couronne) */
function Chest({ x, y, fill = "gold", s = 1 }: { x: number; y: number; fill?: "gold" | "gems" | "crown"; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-18 -30 L18 -30 L20 -44 Q 0 -52 -20 -44 Z" fill="#a8672a" stroke="#5e3410" strokeWidth="1.2" />
      <rect x="-18" y="-30" width="36" height="6" fill="#e0b04a" />
      {fill === "gold" && <g>{[[-10, -30], [-2, -33], [7, -31], [-6, -36], [3, -38], [12, -34]].map(([cx, cy], i) => <ellipse key={i} cx={cx} cy={cy} rx="5" ry="3" fill="#ffd84a" stroke="#b8860b" strokeWidth=".8" />)}</g>}
      {fill === "gems" && <g>{([["#3b82f6", -9], ["#ef4444", -2], ["#22c55e", 5], ["#a855f7", 11], ["#f59e0b", -5]] as const).map(([c, cx], i) => <circle key={i} cx={cx} cy={-32 - (i % 2) * 3} r="3.6" fill={c} stroke="#fff" strokeWidth=".7" />)}</g>}
      {fill === "crown" && <path d="M-11 -30 L-11 -42 L-5 -36 L0 -46 L5 -36 L11 -42 L11 -30 Z" fill="#ffd84a" stroke="#b8860b" />}
      <rect x="-20" y="-28" width="40" height="26" rx="3" fill="#b8742e" stroke="#5e3410" strokeWidth="1.2" />
      <rect x="-20" y="-20" width="40" height="5" fill="#e0b04a" />
      <rect x="-4" y="-22" width="8" height="9" rx="1.5" fill="#e0b04a" stroke="#8a5a10" />
      <path d="M-20 -28 v26 M20 -28 v26" stroke="#e0b04a" strokeWidth="3" />
    </g>
  );
}

function Pine({ x, y, s = 1, c = "#2e7d32" }: { x: number; y: number; s?: number; c?: string }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}><rect x="-2" y="-6" width="4" height="8" fill="#6b4a2b" /><path d="M0 -40 L12 -18 L6 -18 L14 -6 L-14 -6 L-6 -18 L-12 -18 Z" fill={c} /><path d="M0 -40 L-12 -18 L-6 -18 L-14 -6 L0 -6 Z" fill="#000" opacity=".12" /></g>;
}
function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}><path d="M-2 0 Q 0 -14 -1 -22 M1 -14 L6 -20" stroke="#6b4a2b" strokeWidth="4" strokeLinecap="round" /><circle cx="-6" cy="-26" r="10" fill="#4caf50" /><circle cx="6" cy="-28" r="11" fill="#43a047" /><circle cx="0" cy="-36" r="10" fill="#66bb6a" /></g>;
}
function Palm({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}><path d="M0 0 Q 4 -16 2 -34" stroke="#8d6e4a" strokeWidth="4" fill="none" strokeLinecap="round" /><g fill="#43a047"><path d="M2 -34 Q -12 -40 -20 -30 Q -8 -36 2 -32Z" /><path d="M2 -34 Q 16 -42 24 -30 Q 12 -36 2 -32Z" /><path d="M2 -34 Q -2 -48 -14 -48 Q -4 -42 2 -34Z" /><path d="M2 -34 Q 8 -50 20 -46 Q 8 -42 2 -34Z" /></g></g>;
}

/** Décor propre à chaque île */
function Scene({ i }: { i: number }) {
  if (i === 0) return (
    <g>
      <path d="M-50 -2 L-44 -34 L-36 -4 Z" fill="#dff1ff" stroke="#7fb8e6" /><path d="M-40 -2 L-30 -48 L-20 -2 Z" fill="#ffffff" stroke="#7fb8e6" />
      <path d="M-22 -2 L-14 -30 L-6 -2 Z" fill="#cfeaff" stroke="#7fb8e6" /><path d="M-30 -46 L-30 -8" stroke="#fff" strokeWidth="1.5" opacity=".8" />
      <Chest x={24} y={4} fill="gems" s={0.95} />
    </g>
  );
  if (i === 1) return (
    <g>
      <Tree x={-42} y={-2} s={0.95} /><Pine x={-22} y={-4} s={0.85} /><Tree x={44} y={-4} s={0.8} />
      <path d="M-58 4 Q -60 30 -54 52" stroke="#7fd0ff" strokeWidth="7" fill="none" opacity=".9" /><path d="M-58 4 Q -60 30 -54 52" stroke="#fff" strokeWidth="2" fill="none" opacity=".7" strokeDasharray="4 5" />
      <ellipse cx="-34" cy="2" rx="12" ry="4" fill="#5ec8f2" />
      <Chest x={12} y={6} fill="gold" s={0.95} />
    </g>
  );
  if (i === 2) return (
    <g>
      <Palm x={-42} y={0} s={0.85} />
      <Chest x={6} y={4} fill="gold" s={1.1} />
      {[[-24, 4], [-18, 8], [-10, 9], [26, 7], [32, 3], [20, 10]].map(([cx, cy], k) => <ellipse key={k} cx={cx} cy={cy} rx="5" ry="2.8" fill="#ffd84a" stroke="#b8860b" strokeWidth=".8" />)}
      <circle cx="40" cy="-6" r="7" fill="#9e9e9e" /><circle cx="46" cy="-3" r="5" fill="#bdbdbd" />
    </g>
  );
  if (i === 3) return (
    <g>
      <path d="M-52 -2 Q -40 -26 -26 -2 Z" fill="#e3a35e" /><path d="M-34 -2 Q -18 -32 -2 -2 Z" fill="#d48a45" />
      <g transform="translate(26 -6)">
        <path d="M-16 -40 L16 -40 L16 -16 Q 16 0 0 8 Q -16 0 -16 -16 Z" fill="#6d4c2f" stroke="#3e2a18" strokeWidth="1.5" />
        <path d="M-10 -34 L10 -34 L10 -16 Q 10 -4 0 2 Q -10 -4 -10 -16 Z" fill="#f08a3c" />
        <path d="M-26 -46 L22 6 M26 -46 L-22 6" stroke="#cfd8dc" strokeWidth="4" strokeLinecap="round" />
        <path d="M-26 -46 L22 6 M26 -46 L-22 6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".7" />
        <path d="M14 -6 L20 -12 M-14 -6 L-20 -12" stroke="#8d6e4a" strokeWidth="4" strokeLinecap="round" />
      </g>
    </g>
  );
  return (
    <g>
      <path d="M8 -4 L28 -40 L48 -4 Z" fill="#b0bec5" /><path d="M22 -30 L28 -40 L34 -30 L30 -28 L26 -31 Z" fill="#fff" />
      <Pine x={-46} y={-2} s={0.9} /><Pine x={-34} y={-6} s={0.75} c="#388e3c" /><Pine x={50} y={-2} s={0.7} />
      <ellipse cx="18" cy="2" rx="18" ry="5" fill="#4fc3f7" />
      <g transform="translate(-4 4)">
        <path d="M-16 -46 L16 -46 Q 16 -22 0 -18 Q -16 -22 -16 -46 Z" fill="#ffd54f" stroke="#b8860b" strokeWidth="1.5" />
        <path d="M-16 -42 Q -28 -40 -22 -28 Q -18 -24 -12 -26 M16 -42 Q 28 -40 22 -28 Q 18 -24 12 -26" stroke="#e0a800" strokeWidth="3" fill="none" />
        <rect x="-3" y="-18" width="6" height="10" fill="#e0a800" /><rect x="-10" y="-9" width="20" height="5" rx="1.5" fill="#ffd54f" stroke="#b8860b" />
        <path d="M-12 -44 L-10 -24" stroke="#fff" strokeWidth="2" opacity=".6" />
        {([[-9, -40, "#ef4444"], [0, -41, "#3b82f6"], [9, -40, "#22c55e"]] as const).map(([cx, cy, c], k) => <circle key={k} cx={cx} cy={cy} r="2" fill={c} />)}
      </g>
    </g>
  );
}

export function LevelMap({ levels, idx, total, avatar }: { levels: Level[]; idx: number; total: number; avatar: string | null }) {
  const { tr } = useT();
  // Île choisie : par défaut la suivante à atteindre (ou la dernière)
  const [sel, setSel] = useState(Math.min(levels.length - 1, Math.max(0, idx + 1)));
  useEffect(() => { setSel(Math.min(levels.length - 1, Math.max(0, idx + 1))); }, [idx, levels.length]);

  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => `M${a.x} ${a.y - 4} C ${a.x} ${(a.y + b.y) / 2 - 16}, ${b.x} ${(a.y + b.y) / 2 + 16}, ${b.x} ${b.y - 4}`;
  const cur = idx >= 0 ? levels[idx] : null, next = levels[idx + 1] ?? null;
  const from = cur ? cur.min : 0;
  const prog = next ? Math.min(1, Math.max(0, (total - from) / (next.min - from))) : 1;
  const L = levels[sel];
  const reachedSel = idx >= sel;
  const frame = L ? frameOfLevel(L.label) : null;

  return (
    <div>
      <div className="relative overflow-hidden rounded-[22px] border-[3px] border-[#7a5a2a]" style={{ background: "radial-gradient(120% 80% at 20% 10%, #f8ecd0 0%, #efdcb2 60%, #e0c48a 100%)" }}>
        <svg viewBox="0 0 360 732" className="block w-full" role="img" aria-label={tr("Levels")}>
          <defs>
            <filter id="lm-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#5a3d12" floodOpacity=".3" /></filter>
            <pattern id="lm-grain" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#a07c40" opacity=".28" /><circle cx="4.5" cy="4" r=".5" fill="#a07c40" opacity=".2" /></pattern>
            <radialGradient id="lm-edge" cx="50%" cy="50%" r="70%"><stop offset="70%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#6b4a1a" stopOpacity=".35" /></radialGradient>
            <clipPath id="lm-av"><circle cx="0" cy="0" r="15" /></clipPath>
          </defs>
          <rect width="360" height="732" fill="url(#lm-grain)" />
          <rect width="360" height="732" fill="url(#lm-edge)" />

          {SPOTS.slice(0, -1).map((a, i) => {
            const b = SPOTS[i + 1];
            const done = idx > i, going = idx === i;
            return (
              <g key={i}>
                <path d={seg(a, b)} fill="none" stroke="#7a5a2a" strokeWidth="3" strokeDasharray="8 8" strokeLinecap="round" opacity=".6" />
                {(done || going) && <path d={seg(a, b)} fill="none" stroke={levels[i]?.color ?? "#3b82f6"} strokeWidth="4.5" strokeLinecap="round" pathLength={1} strokeDasharray={`${done ? 1 : prog} 1`} />}
                <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r="10" fill={done ? levels[i + 1]?.color ?? "#9e9e9e" : "#cfd2d6"} stroke="#fff" strokeWidth="2.5" />
                <circle cx={(a.x + b.x) / 2 - 3} cy={(a.y + b.y) / 2 - 3} r="3" fill="#fff" opacity=".6" />
              </g>
            );
          })}

          {levels.map((l, i) => {
            const p = SPOTS[i];
            const reached = idx >= i;
            const on = sel === i;
            return (
              <g key={l.label} transform={`translate(${p.x} ${p.y})`} onClick={() => setSel(i)} style={{ cursor: "pointer" }} role="button" aria-label={tr(l.label)} aria-pressed={on}>
                {on && <ellipse cx="0" cy="18" rx="80" ry="42" fill={l.color} opacity=".18" />}
                <g filter="url(#lm-shadow)" style={{ filter: reached ? undefined : "grayscale(1) brightness(1.05)", opacity: reached ? 1 : 0.72 }}>
                  <Isle p={PAL[i]} />
                  <Scene i={i} />
                </g>
                <image href={`/badges/omero-${BADGE[l.label]}.png`} x="34" y="-66" width="30" height="30" style={{ filter: reached ? undefined : "grayscale(1)" }} />
                {!reached && <g transform="translate(-50 -56)"><circle r="12" fill="#3d2a0e" /><path d="M-4 -1 v-3 a4 4 0 0 1 8 0 v3" fill="none" stroke="#fff" strokeWidth="1.8" /><rect x="-5.5" y="-1" width="11" height="8" rx="1.5" fill="#fff" /></g>}
                <g transform="translate(0 84)">
                  <rect x="-64" y="-14" width="128" height="36" rx="10" fill={on ? "#3d2a0e" : "#fff8e6"} stroke="#7a5a2a" strokeWidth="1.5" />
                  <text x="0" y="1" textAnchor="middle" fontSize="13" fontWeight="800" fill={on ? "#fff" : "#3d2a0e"}>{tr(l.label)}</text>
                  <text x="0" y="16" textAnchor="middle" fontSize="9.5" fontWeight="600" fill={on ? "#f3e2bd" : "#6b5530"}>{n(l.count)} {tr(l.count === 1 ? "person" : "people")}</text>
                </g>
              </g>
            );
          })}

          {(() => {
            const p = idx >= 0 ? SPOTS[idx] : { x: SPOTS[0].x + 104, y: SPOTS[0].y + 40 };
            return (
              <g transform={`translate(${p.x - 8} ${p.y - 84})`} style={{ pointerEvents: "none" }}>
                <g className="lm-me">
                  <circle r="18" fill="#fff" stroke="#3d2a0e" strokeWidth="2" />
                  {avatar ? <image href={avatar} x="-15" y="-15" width="30" height="30" clipPath="url(#lm-av)" preserveAspectRatio="xMidYMid slice" /> : <circle r="15" fill="#f26a12" />}
                  <path d="M-6 16 L0 26 L6 16 Z" fill="#3d2a0e" />
                </g>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Avantages du niveau choisi */}
      {L && (
        <div className="mt-3 rounded-[22px] border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/badges/omero-${BADGE[L.label]}.png`} alt="" className={`size-10 ${reachedSel ? "" : "opacity-50 grayscale"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold">{tr("Level {name}", { name: tr(L.label) })}</p>
              <p className="num text-[12px] text-muted-foreground">{L.max ? `${n(L.min)} – ${n(L.max)}` : `${n(L.min)}+`} Omero · {n(L.count)} {tr(L.count === 1 ? "person" : "people")}</p>
            </div>
            {reachedSel
              ? <span className="flex shrink-0 items-center gap-1 rounded-full bg-up/15 px-2.5 py-1 text-[12px] font-bold text-up"><Check className="size-3.5" />{tr("Reached")}</span>
              : <span className="num flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[12px] font-bold text-muted-foreground"><Lock className="size-3" />{tr("{n} Omero left", { n: n(Math.max(0, L.min - total)) })}</span>}
          </div>
          <p className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{tr("Perks on OMdotfun")}</p>
          <ul className="mt-2 space-y-2">
            {levelPerks(sel).map((pk) => (
              <li key={pk.title} className="flex gap-3 rounded-2xl bg-muted/60 p-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: L.color }}><Check className="size-3.5" /></span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold">{tr(pk.title, { level: tr(L.label), frame: tr(frame?.name ?? "") })}</span>
                  <span className="block text-[12.5px] leading-snug text-muted-foreground">{tr(pk.text)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
