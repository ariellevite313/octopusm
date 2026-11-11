/**
 * Tête d'Omero en contour (oreilles pointues, tête ronde), tracée d'après le logo d'OM.
 * `filled` : remplie (vert citron par défaut), pour les posts où le viewer a déjà envoyé un tip.
 */
export const OMERO_LIME = "#a3e635";

const HEAD = "M4.7 2.6 Q8.2 4.3 9.2 6.5 Q12 5.7 14.8 6.5 Q15.8 4.3 19.3 2.6 Q19.9 6.4 19 9.4 C21.3 12.6 20.6 20.9 12 20.9 C3.4 20.9 2.7 12.6 5 9.4 Q4.1 6.4 4.7 2.6 Z";

export function OmeroHeadIcon({ className, filled = false, color = OMERO_LIME, strokeWidth = 1.8 }: {
  className?: string; filled?: boolean; color?: string; strokeWidth?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill={filled ? color : "none"}
      stroke={filled ? color : "currentColor"} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round">
      <path d={HEAD} />
    </svg>
  );
}
