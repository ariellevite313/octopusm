"use client";

/**
 * Carte au trésor des niveaux Omero : une île par niveau, reliées par un chemin en pointillés.
 * Chaque île porte la puce de son niveau, son nom, sa tranche d'Omero et le nombre de personnes qui y sont.
 * Les îles atteintes sont en couleur, les autres grisées avec un cadenas ; l'avatar du profil est posé sur son île.
 * Dessin original en SVG (pas d'image externe).
 */
import { useT } from "@/lib/i18n";

type Level = { label: string; min: number; max: number | null; color: string; count: number };

const BADGE: Record<string, string> = { Blue: "blue", Green: "green", Yellow: "yellow", Orange: "orange", Red: "red" };
const n = (x: number) => Math.round(x).toLocaleString("en-US");

/** Position de chaque île sur la carte (de bas en haut, en zigzag) */
const SPOTS = [{ x: 104, y: 440 }, { x: 252, y: 360 }, { x: 110, y: 272 }, { x: 252, y: 184 }, { x: 178, y: 92 }];
/** Couleurs de chaque île : dessus, falaise, détails */
const ISLE = [
  { top: "#cfe9ff", top2: "#8cc8f5", rock: "#6f8fa8", deco: "ice" },
  { top: "#7fd36b", top2: "#3e9b45", rock: "#8a6a45", deco: "trees" },
  { top: "#f6d36b", top2: "#e0a92e", rock: "#9a7a40", deco: "gold" },
  { top: "#f6a35c", top2: "#d9692a", rock: "#8a4f2c", deco: "dunes" },
  { top: "#ff7b6b", top2: "#d9333f", rock: "#5e3a3a", deco: "crown" },
] as const;

function Deco({ kind }: { kind: (typeof ISLE)[number]["deco"] }) {
  if (kind === "ice") return <g><path d="M-20 -6 L-12 -30 L-4 -6 Z" fill="#e8f6ff" stroke="#8cc8f5" /><path d="M-6 -6 L4 -38 L14 -6 Z" fill="#ffffff" stroke="#8cc8f5" /><path d="M10 -6 L18 -24 L26 -6 Z" fill="#dff1ff" stroke="#8cc8f5" /></g>;
  if (kind === "trees") return <g>{[-22, -4, 14].map((x, i) => <g key={x}><rect x={x + 3} y={-14} width="4" height="10" fill="#6b4a2b" /><circle cx={x + 5} cy={-20 - (i % 2) * 4} r="10" fill={i % 2 ? "#2f8a3c" : "#46a84f"} /></g>)}</g>;
  if (kind === "gold") return <g>{[[-14, -8], [-4, -12], [6, -8], [-9, -16], [1, -20], [14, -10]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="6" ry="3.5" fill="#ffd84a" stroke="#b8860b" />)}<rect x="-24" y="-30" width="18" height="14" rx="2" fill="#a0672c" stroke="#6b4314" /><rect x="-24" y="-30" width="18" height="4" fill="#d4a24a" /></g>;
  if (kind === "dunes") return <g><path d="M-30 -6 Q -16 -26 -2 -6 Z" fill="#f2c27a" /><path d="M-6 -6 Q 10 -32 26 -6 Z" fill="#e9a85a" /><circle cx="20" cy="-30" r="6" fill="#ffd84a" /></g>;
  return <g><path d="M-18 -8 L-18 -28 L-10 -18 L0 -32 L10 -18 L18 -28 L18 -8 Z" fill="#ffd84a" stroke="#b8860b" strokeWidth="1.5" /><circle cx="0" cy="-20" r="3" fill="#d9333f" /><circle cx="-11" cy="-15" r="2.2" fill="#3b82f6" /><circle cx="11" cy="-15" r="2.2" fill="#22c55e" /></g>;
}

export function LevelMap({ levels, idx, total, avatar }: { levels: Level[]; idx: number; total: number; avatar: string | null }) {
  const { tr } = useT();
  // Chemin qui relie les îles (courbes douces entre chaque paire)
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => `M${a.x} ${a.y - 6} C ${a.x} ${(a.y + b.y) / 2 - 10}, ${b.x} ${(a.y + b.y) / 2 + 10}, ${b.x} ${b.y - 6}`;
  // Progression vers l'île suivante (0 à 1)
  const cur = idx >= 0 ? levels[idx] : null, next = levels[idx + 1] ?? null;
  const from = cur ? cur.min : 0;
  const prog = next ? Math.min(1, Math.max(0, (total - from) / (next.min - from))) : 1;

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-[#d8c49a]" style={{ background: "radial-gradient(120% 80% at 20% 10%, #f8ecd0 0%, #efdcb2 60%, #e3c98f 100%)" }}>
      <svg viewBox="0 0 360 540" className="block w-full" role="img" aria-label={tr("Levels")}>
        <defs>
          <filter id="lm-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#5a3d12" floodOpacity=".28" /></filter>
          <pattern id="lm-grain" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#b8955a" opacity=".25" /></pattern>
          <clipPath id="lm-av"><circle cx="0" cy="0" r="15" /></clipPath>
        </defs>
        <rect width="360" height="540" fill="url(#lm-grain)" />

        {/* Chemin : pointillés partout, trait plein sur la partie déjà faite */}
        {SPOTS.slice(0, -1).map((a, i) => {
          const b = SPOTS[i + 1];
          const done = idx > i;
          const going = idx === i;
          return (
            <g key={i}>
              <path d={seg(a, b)} fill="none" stroke="#8a6a3a" strokeWidth="3" strokeDasharray="7 7" strokeLinecap="round" opacity=".55" />
              {(done || going) && <path d={seg(a, b)} fill="none" stroke={levels[i]?.color ?? "#3b82f6"} strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray={`${done ? 1 : prog} 1`} />}
            </g>
          );
        })}

        {/* Îles */}
        {levels.map((l, i) => {
          const p = SPOTS[i], c = ISLE[i];
          const reached = idx >= i;
          return (
            <g key={l.label} transform={`translate(${p.x} ${p.y})`} style={{ filter: reached ? undefined : "grayscale(1)", opacity: reached ? 1 : 0.7 }}>
              <g filter="url(#lm-shadow)">
                {/* Falaise */}
                <path d="M-46 0 L-38 26 L-22 40 L-4 46 L16 40 L34 28 L46 0 Z" fill={c.rock} />
                <path d="M-46 0 L-38 26 L-30 18 L-22 40 L-14 24 L-4 46 L6 26 L16 40 L24 22 L34 28 L46 0 Z" fill="#000" opacity=".12" />
                {/* Dessus */}
                <ellipse cx="0" cy="0" rx="48" ry="16" fill={c.top2} />
                <ellipse cx="0" cy="-3" rx="44" ry="13" fill={c.top} />
                <Deco kind={c.deco} />
              </g>
              {/* Puce du niveau */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <image href={`/badges/omero-${BADGE[l.label]}.png`} x="20" y="-50" width="26" height="26" />
              {!reached && <g transform="translate(-36 -44)"><circle r="11" fill="#2b2b2b" /><path d="M-4 -1 v-3 a4 4 0 0 1 8 0 v3" fill="none" stroke="#fff" strokeWidth="1.8" /><rect x="-5.5" y="-1" width="11" height="8" rx="1.5" fill="#fff" /></g>}
              {/* Nom, tranche et nombre de personnes */}
              <text x="0" y="66" textAnchor="middle" fontSize="15" fontWeight="800" fill="#3d2a0e">{tr(l.label)}</text>
              <text x="0" y="82" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#6b5530">{l.max ? `${n(l.min)} – ${n(l.max)}` : `${n(l.min)}+`} Omero · {n(l.count)} {tr(l.count === 1 ? "person" : "people")}</text>
            </g>
          );
        })}

        {/* Avatar posé sur l'île atteinte (ou au départ) */}
        {(() => {
          const p = idx >= 0 ? SPOTS[idx] : { x: SPOTS[0].x - 70, y: SPOTS[0].y + 40 };
          return (
            <g transform={`translate(${p.x - 6} ${p.y - 64})`}>
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
  );
}
