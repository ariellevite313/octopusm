"use client";

import { useId, useRef } from "react";
import Link from "next/link";
import type { LaunchpadToken } from "@/services/launchpad-service";
import { useSparkline } from "@/components/launchpad/mini-price-chart";
import { SolanaMark, ArcMark } from "@/components/shared/solana-mark";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import { VerifiedTokenBadge } from "@/components/shared/verified-token-badge";
import { useT } from "@/lib/i18n";

/**
 * Carte « dossier » d'un token : en haut, une feuille colorée (logo flouté) avec le graphique du prix ;
 * devant, la pochette sombre avec le nom, le ticker, le créateur, la capitalisation et la date de lancement.
 * Au survol (ou à l'appui sur téléphone), la feuille sort un peu de la pochette.
 */

// Forme de la pochette (onglet à gauche), en coordonnées 300 × 306
const W = 300, H = 306, Y1 = H * 0.42, Y2 = H * 0.52, TW = W * 0.56, SL = W * 0.08, R = 22;
const POCKET = `M0,${Y1 + R} Q0,${Y1} ${R},${Y1} L${TW - 14},${Y1} Q${TW},${Y1} ${TW + 9},${Y1 + 9} L${TW + SL - 7},${Y2 - 7} Q${TW + SL + 2},${Y2} ${TW + SL + 16},${Y2} L${W - R},${Y2} Q${W},${Y2} ${W},${Y2 + R} L${W},${H - R} Q${W},${H} ${W - R},${H} L${R},${H} Q0,${H} 0,${H - R} Z`;

function fmtMc(n: number | null): string {
  if (n == null) return "$—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function TokenFolderCard({ token }: { token: LaunchpadToken }) {
  const { tr, lang } = useT();
  const ref = useRef<HTMLAnchorElement>(null);
  const gid = `tfc-${useId().replace(/:/g, "")}`;
  const isArc = token.chain === "arc";
  const points = useSparkline(ref, { chain: isArc ? "arc" : "solana", pool: token.pool_address, mint: token.mint_address, curve: token.arc_launch_id });

  // Graphique : de gauche à droite sur la feuille
  const pts = points && points.length >= 2 ? points : null;
  let line = "", area = "", change: number | null = null;
  if (pts) {
    const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
    line = pts.map((p, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * W).toFixed(1)},${(118 - ((p - min) / span) * 100).toFixed(1)}`).join(" ");
    area = `${line} L${W},130 L0,130 Z`;
    change = pts[0] > 0 ? ((pts[pts.length - 1] - pts[0]) / pts[0]) * 100 : null;
  }
  const up = (change ?? 0) >= 0;
  const creator = token.creator_display_name ?? shortAddr(token.creator_wallet);
  const date = new Date(token.created_at).toLocaleDateString(lang === "en" ? "en-US" : lang, { month: "short", day: "numeric", year: "numeric" });

  return (
    <Link ref={ref} href={`/launchpad/${token.mint_address ?? token.id}`} className="tok-fold" title={`${token.name} ($${token.ticker})`}>
      <div className="tok-fold-in">
        {/* Feuille colorée */}
        <div className="tok-fold-sheet">
          {token.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={token.logo_url} alt="" aria-hidden className="tok-fold-art" />
          )}
          <div className="tok-fold-dots" />
          {pts && (
            <svg className="tok-fold-chart" viewBox={`0 0 ${W} 130`} preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
              </defs>
              <path d={area} fill={`url(#${gid})`} />
              <path d={line} fill="none" stroke={up ? "#4ade80" : "#f87171"} strokeWidth="6" opacity=".5" style={{ filter: "blur(3px)" }} />
              <path d={line} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {token.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={token.logo_url} alt={token.name} className="tok-fold-logo" />
          ) : (
            <span className="tok-fold-logo flex items-center justify-center bg-black/40 text-[5cqw] font-bold">{token.ticker.slice(0, 3)}</span>
          )}
          <span className="tok-fold-chain">{isArc ? <ArcMark className="size-full text-white" /> : <SolanaMark className="size-full text-white" />}</span>
        </div>

        {/* Pochette */}
        <svg className="tok-fold-pocket" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden><path d={POCKET} /></svg>
        <span className="tok-fold-name">
          <span className="truncate">{token.name}</span>
          {token.is_verified && <VerifiedTokenBadge className="tok-fold-verified" />}
        </span>
        <span className="tok-fold-ticker">${token.ticker}</span>
        {change !== null && <span className={`tok-fold-change ${up ? "text-[#4ade80]" : "text-[#f87171]"}`}>{up ? "+" : ""}{change.toFixed(1)}%</span>}
        <span className="tok-fold-by">
          <span>{tr("by")}</span>
          {token.creator_avatar_src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={token.creator_avatar_src} alt="" />
          )}
          <b>{creator}</b>
          {(token.creator_octo ?? 0) > 0 && <OctoBadge totalOcto={token.creator_octo ?? 0} size={12} />}
        </span>
        <span className="tok-fold-mc">{fmtMc(token.market_cap_usd)} <small>MC</small></span>
        <span className="tok-fold-date"><span>{tr("Launched on")}</span><b>{date}</b></span>
      </div>
    </Link>
  );
}
