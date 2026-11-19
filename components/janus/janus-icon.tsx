/** Logo Janus sans le carré jaune : prend la couleur du texte (currentColor), comme les icônes du menu. */
export function JanusIcon({ className = "size-5" }: { className?: string; strokeWidth?: number }) {
  return (
    <span aria-hidden className={`inline-block bg-current ${className}`}
      style={{ WebkitMaskImage: "url(/janus/mark-black.png)", maskImage: "url(/janus/mark-black.png)", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }} />
  );
}

/** Pastille ronde jaune avec le logo (badges des profils de Janus) */
export function JanusBadgeIcon({ size = 16 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/janus/badge.png" alt="Janus" width={size} height={size} className="shrink-0 rounded-full" style={{ width: size, height: size }} />;
}
