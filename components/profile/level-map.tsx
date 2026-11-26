"use client";

/**
 * Omero Map : la carte des niveaux, comme un jardin vu de haut. Un chemin pavé serpente du bas vers le haut,
 * avec une placette clôturée par niveau (décor et trésor du niveau, panneau en bois avec sa puce et son nom).
 * Haies, buissons, mare et clôtures autour. Les placettes non atteintes sont grisées avec un cadenas ;
 * l'avatar du profil est posé sur sa placette. On touche une placette : ses avantages s'affichent sous la carte.
 * Dessin original en SVG (pas d'image externe, aucun personnage d'un autre jeu).
 */
import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";
import { useT } from "@/lib/i18n";
import { frameOfLevel, levelPerks } from "@/lib/level-perks";

type Level = { label: string; min: number; max: number | null; color: string; count: number };

const BADGE: Record<string, string> = { Blue: "blue", Green: "green", Yellow: "yellow", Orange: "orange", Red: "red" };
const n = (x: number) => Math.round(x).toLocaleString("en-US");

const W = 360, H = 800;
/** Placettes des niveaux, de bas en haut, sur les virages du chemin */
const SPOTS = [{ x: 262, y: 664 }, { x: 98, y: 524 }, { x: 262, y: 384 }, { x: 98, y: 244 }, { x: 200, y: 108 }];
/** Le chemin passe par toutes les placettes */
const ROAD = "M150 830 C 150 760, 262 744, 262 664 S 98 604, 98 524 S 262 464, 262 384 S 98 324, 98 244 S 200 188, 200 108 L 200 -30";

/** Grand buisson de feuilles (vu de haut) */
function Bush({ x, y, s = 1, r = 0 }: { x: number; y: number; s?: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 0 C 10 -8, 22 -10, 30 -2 C 22 8, 10 8, 0 0 Z" fill="#2f9e44" />
          <path d="M0 0 C 10 -8, 22 -10, 30 -2" fill="none" stroke="#1f7a33" strokeWidth="1.2" />
          <path d="M4 -1 L 26 -2" stroke="#8be08f" strokeWidth="1" opacity=".7" />
        </g>
      ))}
      <circle r="6" fill="#43c05a" />
    </g>
  );
}
/** Clôture en bois (poteaux et deux lisses) */
function Fence({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const k = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 22));
  return (
    <g>
      <path d={`M${x1} ${y1 - 4} L${x2} ${y2 - 4} M${x1} ${y1 + 3} L${x2} ${y2 + 3}`} stroke="#5b6cc0" strokeWidth="3" strokeLinecap="round" />
      {Array.from({ length: k + 1 }, (_, i) => <rect key={i} x={x1 + ((x2 - x1) * i) / k - 2.5} y={y1 + ((y2 - y1) * i) / k - 11} width="5" height="16" rx="1.5" fill="#3f4fa0" />)}
    </g>
  );
}
/** Panneau en bois sur poteau, avec la puce et le nom du niveau */
function Sign({ label, count, badge, on, reached, tr }: { label: string; count: string; badge: string; on: boolean; reached: boolean; tr: (s: string) => string }) {
  return (
    <g>
      <rect x="-2.5" y="-6" width="5" height="22" fill="#6b4a2b" />
      <rect x="-56" y="-40" width="112" height="36" rx="7" fill={on ? "#3d2a0e" : "#c99a5b"} stroke="#6b4a2b" strokeWidth="2" />
      <path d="M-52 -30 H52 M-52 -18 H52" stroke="#000" strokeOpacity=".08" />
      <image href={`/badges/omero-${badge}.png`} x="-50" y="-36" width="28" height="28" style={{ filter: reached ? undefined : "grayscale(1)" }} />
      <text x="-16" y="-24" fontSize="12.5" fontWeight="800" fill={on ? "#fff" : "#2b1a06"}>{tr(label)}</text>
      <text x="-16" y="-11" fontSize="9" fontWeight="700" fill={on ? "#f3e2bd" : "#4a3214"}>{count}</text>
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
  // Placette choisie : par défaut la suivante à atteindre (ou la dernière)
  const [sel, setSel] = useState(Math.min(levels.length - 1, Math.max(0, idx + 1)));
  useEffect(() => { setSel(Math.min(levels.length - 1, Math.max(0, idx + 1))); }, [idx, levels.length]);

  const L = levels[sel];
  const reachedSel = idx >= sel;
  const frame = L ? frameOfLevel(L.label) : null;
  // Part du chemin déjà parcourue (0 à 1) : chaque placette atteinte, plus l'avance vers la suivante
  const cur = idx >= 0 ? levels[idx] : null, next = levels[idx + 1] ?? null;
  const prog = next ? Math.min(1, Math.max(0, (total - (cur ? cur.min : 0)) / (next.min - (cur ? cur.min : 0)))) : 1;
  const stops = [0.13, 0.31, 0.5, 0.69, 0.87];
  const walked = idx < 0 ? stops[0] * prog : idx >= stops.length - 1 ? 1 : stops[idx] + (stops[idx + 1] - stops[idx]) * prog;

  return (
    <div>
      <div className="relative overflow-hidden rounded-[22px] border-[3px] border-[#2f6b2a]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Omero Map">
          <defs>
            <linearGradient id="om-grass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6fcf4f" /><stop offset=".55" stopColor="#4fb83c" /><stop offset="1" stopColor="#3a9a33" /></linearGradient>
            <pattern id="om-blades" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M3 10 l1.5 -5 M9 6 l-1 -4 M11 12 l1 -3" stroke="#2f8a2a" strokeWidth="1" opacity=".45" /><circle cx="6" cy="2" r=".9" fill="#a6ec7c" opacity=".5" /></pattern>
            <pattern id="om-stones" width="26" height="26" patternUnits="userSpaceOnUse">
              <rect width="26" height="26" fill="#ead9b5" />
              <ellipse cx="7" cy="7" rx="5.5" ry="4.5" fill="#dcc79c" /><ellipse cx="19" cy="15" rx="6" ry="5" fill="#d8c294" /><ellipse cx="6" cy="20" rx="4" ry="3.5" fill="#e2cfa6" /><ellipse cx="20" cy="4" rx="3.5" ry="3" fill="#dfcaa0" />
            </pattern>
            <radialGradient id="om-sun" cx="30%" cy="20%" r="80%"><stop offset="0" stopColor="#fff7c2" stopOpacity=".35" /><stop offset=".6" stopColor="#fff7c2" stopOpacity="0" /></radialGradient>
            <filter id="om-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="2" dy="5" stdDeviation="3" floodColor="#0b3a0b" floodOpacity=".35" /></filter>
            <clipPath id="om-av"><circle cx="0" cy="0" r="15" /></clipPath>
          </defs>

          {/* Herbe */}
          <rect width={W} height={H} fill="url(#om-grass)" />
          <rect width={W} height={H} fill="url(#om-blades)" />

          {/* Mare et ruisseau */}
          <g filter="url(#om-shadow)">
            <ellipse cx="300" cy="530" rx="40" ry="28" fill="#c9b48a" />
            <ellipse cx="300" cy="530" rx="34" ry="23" fill="#4fb3e8" />
            <ellipse cx="292" cy="524" rx="20" ry="11" fill="#8fd6ff" opacity=".6" />
            <circle cx="312" cy="536" r="6" fill="#43a047" /><circle cx="314" cy="534" r="2" fill="#ff8fb1" />
          </g>
          <path d="M-10 760 C 30 740, 40 700, 70 690" stroke="#4fb3e8" strokeWidth="9" fill="none" strokeLinecap="round" opacity=".9" />

          {/* Chemin pavé : bordure, pavés, puis la partie déjà parcourue en lumière */}
          <path d={ROAD} fill="none" stroke="#b89e6c" strokeWidth="58" strokeLinecap="round" />
          <path d={ROAD} fill="none" stroke="url(#om-stones)" strokeWidth="50" strokeLinecap="round" />
          <path d={ROAD} fill="none" stroke="#fff3c4" strokeWidth="10" strokeLinecap="round" pathLength={1} strokeDasharray={`${walked} 1`} opacity=".55" />

          {/* Buissons et clôtures autour */}
          <Bush x={30} y={620} s={1.1} /><Bush x={330} y={760} s={1.2} r={20} /><Bush x={330} y={250} s={1} r={40} />
          <Bush x={28} y={380} s={1.15} r={10} /><Bush x={180} y={300} s={0.8} r={30} /><Bush x={176} y={590} s={0.85} r={15} /><Bush x={36} y={110} s={1} r={55} />
          <Fence x1={8} y1={22} x2={120} y2={30} /><Fence x1={290} y1={30} x2={352} y2={22} />
          <Fence x1={8} y1={790} x2={95} y2={780} /><Fence x1={232} y1={782} x2={352} y2={792} />

          {/* Placettes des niveaux (touchables) */}
          {levels.map((l, i) => {
            const p = SPOTS[i];
            const reached = idx >= i;
            const on = sel === i;
            return (
              <g key={l.label} transform={`translate(${p.x} ${p.y})`} onClick={() => setSel(i)} style={{ cursor: "pointer" }} role="button" aria-label={tr(l.label)} aria-pressed={on}>
                {on && <circle r="62" fill={l.color} opacity=".25" />}
                <g filter="url(#om-shadow)">
                  <circle r="50" fill="#c9b48a" />
                  <circle r="50" fill="none" stroke="url(#om-stones)" strokeWidth="10" />
                  <circle r="43" fill="#5cc246" />
                  <circle r="43" fill="url(#om-blades)" />
                </g>
                {/* Piquets et corde autour */}
                {Array.from({ length: 10 }, (_, k) => {
                  const a = (k / 10) * Math.PI * 2;
                  return <circle key={k} cx={Math.cos(a) * 41} cy={Math.sin(a) * 41} r="3" fill="#8a5a2b" stroke="#5e3a17" />;
                })}
                <circle r="41" fill="none" stroke="#c48a4a" strokeWidth="1.5" strokeDasharray="3 3" />
                <g transform="translate(0 16) scale(.62)" style={{ filter: reached ? undefined : "grayscale(1)", opacity: reached ? 1 : 0.75 }}>
                  <Scene i={i} />
                </g>
                {!reached && <g transform="translate(28 -28)"><circle r="12" fill="#2b1a06" /><path d="M-4 -1 v-3 a4 4 0 0 1 8 0 v3" fill="none" stroke="#fff" strokeWidth="1.8" /><rect x="-5.5" y="-1" width="11" height="8" rx="1.5" fill="#fff" /></g>}
                <g transform={`translate(${p.x > 180 ? -26 : 26} -54)`}>
                  <Sign label={l.label} count={`${n(l.count)} ${tr(l.count === 1 ? "person" : "people")}`} badge={BADGE[l.label]} on={on} reached={reached} tr={(x) => tr(x)} />
                </g>
              </g>
            );
          })}

          {/* Avatar sur sa placette (ou au départ du chemin) */}
          {(() => {
            const p = idx >= 0 ? SPOTS[idx] : { x: 150, y: 770 };
            return (
              <g transform={`translate(${p.x + (p.x > 180 ? 34 : -34)} ${p.y - 30})`} style={{ pointerEvents: "none" }}>
                <g className="lm-me">
                  <circle r="18" fill="#fff" stroke="#2b1a06" strokeWidth="2" />
                  {avatar ? <image href={avatar} x="-15" y="-15" width="30" height="30" clipPath="url(#om-av)" preserveAspectRatio="xMidYMid slice" /> : <circle r="15" fill="#f26a12" />}
                  <path d="M-6 16 L0 26 L6 16 Z" fill="#2b1a06" />
                </g>
              </g>
            );
          })()}

          {/* Lumière du soleil */}
          <rect width={W} height={H} fill="url(#om-sun)" style={{ pointerEvents: "none" }} />
        </svg>
      </div>

      {/* Avantages du niveau choisi */}
      {L && (
        <div className="mt-4 px-1">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/badges/omero-${BADGE[L.label]}.png`} alt="" className={`size-10 ${reachedSel ? "" : "opacity-50 grayscale"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold">{tr("Level {name}", { name: tr(L.label) })}</p>
              <p className="num text-[12px] text-muted-foreground">{L.max ? `${n(L.min)} – ${n(L.max)}` : `${n(L.min)}+`} Omero · {n(L.count)} {tr(L.count === 1 ? "person" : "people")}</p>
            </div>
            {reachedSel
              ? <span className="flex shrink-0 items-center gap-1 text-[13px] font-bold text-up"><Check className="size-4" />{tr("Reached")}</span>
              : <span className="num flex shrink-0 items-center gap-1 text-[13px] font-bold text-muted-foreground"><Lock className="size-3.5" />{tr("{n} Omero left", { n: n(Math.max(0, L.min - total)) })}</span>}
          </div>
          <p className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{tr("Perks on OMdotfun")}</p>
          <ul className="mt-3 space-y-4">
            {levelPerks(sel).map((pk) => (
              <li key={pk.title} className="flex gap-3">
                <Check className="mt-0.5 size-5 shrink-0" strokeWidth={3} style={{ color: L.color }} />
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold">{tr(pk.title, { level: tr(L.label), frame: tr(frame?.name ?? ""), ...pk.vars })}</span>
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
