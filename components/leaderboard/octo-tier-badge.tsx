export interface OctoTier {
  label: string;
  min: number;
  max: number;
  color: string;
}

export const OCTO_TIERS: OctoTier[] = [
  { label: "Blue",   min: 1_000,  max: 5_000,   color: "#3B82F6" },
  { label: "Green",  min: 5_001,  max: 10_000,  color: "#22C55E" },
  { label: "Yellow", min: 10_001, max: 20_000,  color: "#EAB308" },
  { label: "Orange", min: 20_001, max: 50_000,  color: "#F97316" },
  { label: "Red",    min: 50_001, max: Infinity, color: "#F43F5E" },
];

export function getOctoTier(totalOcto: number): OctoTier | null {
  return OCTO_TIERS.find((t) => totalOcto >= t.min && totalOcto <= t.max) ?? null;
}

/* eslint-disable @next/next/no-img-element */
const BADGE_IMG: Record<string, string> = {
  Blue: "/badges/omero-blue.png",
  Green: "/badges/omero-green.png",
  Yellow: "/badges/omero-yellow.png",
  Orange: "/badges/omero-orange.png",
  Red: "/badges/omero-red.png",
};

function BadgeImg({ src, size, title }: { src: string; size: number; title: string }) {
  return (
    <img
      src={src}
      alt=""
      title={title}
      width={size}
      height={size}
      draggable={false}
      className="inline-block shrink-0 select-none object-contain"
      style={{ width: size, height: size }}
    />
  );
}

/** Puce de vérification du niveau OMERO (une couleur par niveau). */
export function OctoBadge({ totalOcto, size = 14 }: { totalOcto: number; size?: number }) {
  const tier = getOctoTier(totalOcto);
  if (!tier) return null;
  return <BadgeImg src={BADGE_IMG[tier.label]} size={size} title={`${tier.label} — ${totalOcto.toLocaleString()} OMERO`} />;
}

export function AdminBadge({ size = 14 }: { size?: number }) {
  return <BadgeImg src="/badges/omero-admin.png" size={size} title="Admin" />;
}
