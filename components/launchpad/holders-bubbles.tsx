"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, ExternalLink, Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import { packBubbles, buildClusters } from "@/lib/holders-analysis";
import { initNodes, stepSim, type SimNode, type SimLink } from "@/lib/bubble-sim";

type H = { owner: string; pct: number; isProgram: boolean; name?: string | null };
const SIZE = 100;
/** Octogone régulier inscrit dans le cercle de rayon r (côté plat en haut). */
const oct = (x: number, y: number, r: number) =>
  Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + (i * Math.PI) / 4; return `${(x + r * Math.cos(a)).toFixed(2)},${(y + r * Math.sin(a)).toFixed(2)}`; }).join(" ");
const OCT_CLIP = "polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)";

/**
 * Bubble map interactive : une bulle par holder (taille = % du supply), déplaçable à la souris ou au doigt.
 * Rouge = bundle (relié en étoile), gris = pool/programme, bleu = autres holders.
 */
export function HoldersBubbles({ holders, bundle, chain }: { holders: H[]; bundle: Set<string>; chain: "solana" | "arc" }) {
  const { tr } = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const alphaRef = useRef(1);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const rafRef = useRef(0);
  const [, setTick] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const byOwner = useMemo(() => new Map(holders.map((h) => [h.owner, h])), [holders]);
  // Bundle : tous reliés au plus gros portefeuille du bundle
  const links = useMemo<SimLink[]>(() => {
    const ids = holders.filter((h) => bundle.has(h.owner)).sort((a, b) => b.pct - a.pct).map((h) => h.owner);
    return ids.slice(1).map((id) => ({ a: ids[0], b: id }));
  }, [holders, bundle]);

  // Groupes reliés + couleur par groupe ; les holders isolés restent sombres
  const { clusters, of: clusterOf } = useMemo(() => buildClusters(holders.map((h) => ({ owner: h.owner, pct: h.pct })), links), [holders, links]);

  useEffect(() => {
    const packed = packBubbles(holders.map((h) => ({ owner: h.owner, pct: h.pct })), SIZE, 1.4, 14);
    nodesRef.current = initNodes(packed.map((b) => ({ id: b.owner, r: b.r, x: b.x, y: b.y })));
    alphaRef.current = 1;
    const loop = () => {
      const energy = stepSim(nodesRef.current, links, SIZE, alphaRef.current);
      alphaRef.current = Math.max(0, alphaRef.current - 0.004);
      setTick((t) => t + 1);
      if (dragRef.current || (alphaRef.current > 0.02 && energy > 0.02)) rafRef.current = requestAnimationFrame(loop);
      else rafRef.current = 0;
    };
    const kick = () => { if (!rafRef.current) rafRef.current = requestAnimationFrame(loop); };
    (nodesRef.current as SimNode[] & { kick?: () => void }).kick = kick;
    kick();
    return () => { cancelAnimationFrame(rafRef.current); rafRef.current = 0; };
  }, [holders, links]);

  const kick = () => (nodesRef.current as SimNode[] & { kick?: () => void }).kick?.();
  const toSvg = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM()!.inverse();
    const p = pt.matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  const onDown = (id: string) => (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { id, moved: false };
    const n = nodesRef.current.find((x) => x.id === id); if (n) n.fixed = true;
    alphaRef.current = 0.6; kick();
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const n = nodesRef.current.find((x) => x.id === d.id); if (!n) return;
    const p = toSvg(e);
    n.x = Math.min(SIZE - n.r, Math.max(n.r, p.x)); n.y = Math.min(SIZE - n.r, Math.max(n.r, p.y));
    d.moved = true; alphaRef.current = Math.max(alphaRef.current, 0.4); kick();
  };
  const onUp = () => {
    const d = dragRef.current; if (!d) return;
    const n = nodesRef.current.find((x) => x.id === d.id); if (n) n.fixed = false;
    if (!d.moved) setSelected((s) => (s === d.id ? null : d.id));
    dragRef.current = null; alphaRef.current = Math.max(alphaRef.current, 0.3); kick();
  };

  const nodes = nodesRef.current;
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const tipId = selected;
  const tipNode = tipId ? pos.get(tipId) : undefined;
  const tipH = tipId ? byOwner.get(tipId) : undefined;
  const tip = tipNode && tipH ? { node: tipNode, h: tipH, cluster: clusterOf.has(tipH.owner) ? clusters[clusterOf.get(tipH.owner)!] : null } : null;
  const explorer = (o: string) => (chain === "arc" ? `https://explorer.arc.io/address/${o}` : `https://solscan.io/account/${o}`);
  // Holder : vert · Bundle : rouge · Pool / programme : gris
  const colorOf = (h: H) => {
    if (h.isProgram) return { fill: "#6b6a7a", glow: "#a4a3b4" };
    if (bundle.has(h.owner)) return { fill: "#ef4444", glow: "#f87171" };
    return { fill: "#22c55e", glow: "#4ade80" };
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-background">
        <svg ref={svgRef} viewBox={`0 0 ${SIZE} ${SIZE}`} className="aspect-square w-full touch-none select-none" role="img" aria-label={tr("Bubble map")}
          onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <defs>
            <style>{`@keyframes bm-pulse{0%{transform:scale(1);opacity:.9}100%{transform:scale(1.9);opacity:0}}`}</style>
            <filter id="bm-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {links.map((l) => {
            const a = pos.get(l.a), b = pos.get(l.b);
            if (!a || !b) return null;
            // Le trait va de bord à bord : il ne traverse jamais l'intérieur d'un octogone
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
            if (d <= a.r + b.r) return null;
            const ux = dx / d, uy = dy / d;
            return <line key={l.a + l.b} x1={a.x + ux * a.r} y1={a.y + uy * a.r} x2={b.x - ux * b.r} y2={b.y - uy * b.r} stroke="currentColor" className="text-muted-foreground" strokeOpacity={0.7} strokeWidth={0.25} />;
          })}
          {nodes.map((n) => {
            const h = byOwner.get(n.id); if (!h) return null;
            const col = colorOf(h);
            const on = selected === n.id;
            return (
              <g key={n.id} onPointerDown={onDown(n.id)} style={{ cursor: "grab" }} filter="url(#bm-glow)">
                {on && <polygon points={oct(n.x, n.y, n.r)} fill="none" stroke={col.glow || "currentColor"} strokeWidth={0.4} style={{ transformBox: "fill-box", transformOrigin: "center", animation: "bm-pulse 1.4s ease-out infinite" }} />}
                <polygon points={oct(n.x, n.y, n.r)} className="fill-background" />
                <polygon points={oct(n.x, n.y, n.r)} strokeLinejoin="round" fill={col.fill} fillOpacity={on ? 0.6 : 0.35} stroke={col.glow} strokeWidth={on ? 0.7 : 0.4} />
              </g>
            );
          })}
        </svg>
        {tip && (
          <div className="absolute z-10 w-max max-w-[80%] rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground shadow-lg"
            style={{ left: `${Math.min(62, Math.max(2, tip.node.x - 14))}%`, top: `${Math.min(80, Math.max(2, tip.node.y - tip.node.r - 16))}%` }}>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{tip.h.name ?? `${tip.h.owner.slice(0, 4)}…${tip.h.owner.slice(-4)}`}</span>
              <button aria-label="copy" onPointerDown={(e) => e.stopPropagation()} onClick={() => { void navigator.clipboard?.writeText(tip.h.owner); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="opacity-80 hover:opacity-100">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </button>
              <a aria-label="explorer" href={explorer(tip.h.owner)} target="_blank" rel="noopener noreferrer" className="opacity-80 hover:opacity-100"><ExternalLink className="size-3.5" /></a>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
              <span>{tip.cluster && bundle.has(tip.h.owner) ? tr("Bundle supply") : tr("Supply")}: {(tip.cluster && bundle.has(tip.h.owner) ? tip.cluster.supply : tip.h.pct).toFixed(2)}%</span>
              <span className="size-3" style={{ background: colorOf(tip.h).glow, clipPath: OCT_CLIP }} />
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="size-3" style={{ background: "#22c55e", clipPath: OCT_CLIP }} />{tr("Holders")}</span>
        {bundle.size > 0 && <span className="flex items-center gap-1"><span className="size-3" style={{ background: "#ef4444", clipPath: OCT_CLIP }} />{tr("Bundle")}</span>}
        <span className="flex items-center gap-1"><span className="size-3" style={{ background: "#6b6a7a", clipPath: OCT_CLIP }} />{tr("Pool / program")}</span>
      </div>
    </div>
  );
}
