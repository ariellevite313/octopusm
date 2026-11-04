"use client";

import { useId } from "react";

/**
 * Patte de chien (couleur = currentColor). `glass` : remplissage en dégradé translucide
 * avec un fin reflet clair, pour le bouton en verre.
 */
export function PawIcon({ className, glass = false }: { className?: string; glass?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      {glass && (
        <defs>
          <linearGradient id={`paw-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.95" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.55" />
          </linearGradient>
        </defs>
      )}
      <g
        fill={glass ? `url(#paw-${id})` : "currentColor"}
        {...(glass ? { stroke: "rgba(255,255,255,0.55)", strokeWidth: 0.35 } : {})}
      >
        <ellipse cx="4.3" cy="10.2" rx="2.5" ry="3.3" transform="rotate(-26 4.3 10.2)" />
        <ellipse cx="9.1" cy="4.6" rx="2.7" ry="3.6" transform="rotate(-10 9.1 4.6)" />
        <ellipse cx="14.9" cy="4.6" rx="2.7" ry="3.6" transform="rotate(10 14.9 4.6)" />
        <ellipse cx="19.7" cy="10.2" rx="2.5" ry="3.3" transform="rotate(26 19.7 10.2)" />
        <path d="M12 11.2c-3.5 0-7.4 3.7-8.2 7-.7 2.7 1.2 4.7 3.9 4.2 1.7-.3 2.8-1.1 4.3-1.1s2.6.8 4.3 1.1c2.7.5 4.6-1.5 3.9-4.2-.8-3.3-4.7-7-8.2-7z" />
      </g>
    </svg>
  );
}
