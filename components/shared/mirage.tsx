"use client";

/**
 * Indicateur de chargement « Mirage » utilisé partout sur OM : des points glissent de gauche à droite,
 * grossissent au centre et fusionnent comme un liquide (effet « gooey »). Prend la couleur du texte.
 * La hauteur vient de la classe (ex. size-4) ; la largeur suit (rapport 3:1).
 */
import { useId } from "react";

export function Mirage({ className = "size-5", label = "Loading" }: { className?: string; label?: string }) {
  const id = `mirage-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 48 16" role="status" aria-label={label} className={`inline-block shrink-0 ${className}`} style={{ width: "auto", aspectRatio: "3 / 1", overflow: "visible" }}>
      <defs>
        <filter id={id} x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
        </filter>
      </defs>
      <g filter={`url(#${id})`} fill="currentColor">
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx="24" cy="8" r="5" className="om-mirage-dot" style={{ animationDelay: `${-i * 0.3}s` }} />
        ))}
      </g>
    </svg>
  );
}
