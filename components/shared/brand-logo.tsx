import Image from "next/image";

/** Logo OMdotfun : fin contour orange qui suit sa silhouette, avec une lumière qui le parcourt en boucle
 *  et qui gonfle quand le logo rebondit. */
export function BrandLogo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`logo-bounce relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      <span aria-hidden className="logo-ring pointer-events-none absolute inset-0" />
      <Image src="/omdot-icon.png" alt="OMdotfun" width={size} height={size} className="relative" priority />
    </span>
  );
}
