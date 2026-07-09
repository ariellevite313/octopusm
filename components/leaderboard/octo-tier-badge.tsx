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

function FilledBadgeCheck({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill={color}
      />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OctoBadge({ totalOcto, size = 14 }: { totalOcto: number; size?: number }) {
  const tier = getOctoTier(totalOcto);
  if (!tier) return null;
  return (
    <span title={`${tier.label} — ${totalOcto.toLocaleString()} OCTO`} className="inline-flex shrink-0 items-center text-white dark:text-zinc-950">
      <FilledBadgeCheck color={tier.color} size={size} />
    </span>
  );
}

export function AdminBadge({ size = 14 }: { size?: number }) {
  return (
    <span title="Admin" className="inline-flex shrink-0 items-center text-white dark:text-zinc-950">
      <FilledBadgeCheck color="#6B7280" size={size} />
    </span>
  );
}
