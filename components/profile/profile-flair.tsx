/* eslint-disable @next/next/no-img-element */
/** Animations de profil : contour animé autour de l'avatar et mascottes Omero qui dépassent de la bannière. */
import { OCTO_TIERS } from "@/components/leaderboard/octo-tier-badge";
import type { FrameId } from "@/lib/profile-cosmetics";

const BADGE: Record<string, string> = { Blue: "blue", Green: "green", Yellow: "yellow", Orange: "orange", Red: "red" };

/** Couronne du n°1 des gains sur OM, posée sur l'avatar et qui se balance. */
function Crown() {
  return (
    <svg className="om-crown" viewBox="0 0 32 24" role="img" aria-label="Top earner on OM">
      <path d="M3 20 L1.5 6 L9.5 12 L16 2 L22.5 12 L30.5 6 L29 20 Z" fill="url(#om-crown-g)" stroke="#7c2d12" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="3" y="19" width="26" height="3.5" rx="1.2" fill="#b45309" />
      <circle cx="16" cy="13.5" r="2.2" fill="#f43f5e" /><circle cx="9" cy="15.5" r="1.5" fill="#f43f5e" /><circle cx="23" cy="15.5" r="1.5" fill="#f43f5e" />
      <defs><linearGradient id="om-crown-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#f59e0b" /></linearGradient></defs>
    </svg>
  );
}

/** Entoure l'avatar du contour choisi (aucun contour : l'avatar seul) ; `crown` : la couronne du n°1 des gains. */
export function FrameWrap({ frame, crown = false, children }: { frame: FrameId | null; crown?: boolean; children: React.ReactNode }) {
  if (!frame && !crown) return <>{children}</>;
  return <span className={`relative inline-flex rounded-full ${frame ? `om-frame om-frame-${frame}` : ""}`}>{children}{crown && <Crown />}</span>;
}

/** Une mascotte par niveau atteint, chacune avec la puce de son niveau, qui bougent l'une après l'autre. */
export function BannerBuddies({ count, size = 42 }: { count: number; size?: number }) {
  if (count <= 0) return null;
  const tiers = OCTO_TIERS.slice(0, Math.min(count, OCTO_TIERS.length));
  return (
    <div className="pointer-events-none absolute bottom-0 right-3 flex items-end gap-1 sm:right-5" aria-hidden>
      {tiers.map((t, i) => (
        <span key={t.label} className="om-buddy relative" style={{ animationDelay: `${i * 0.35}s` }}>
          <img src="/profile/omero-peek.png" alt="" width={size} height={Math.round(size * 1.11)} className="block select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" draggable={false} style={{ width: size, height: "auto" }} />
          <img src={`/badges/omero-${BADGE[t.label]}.png`} alt="" width={15} height={15} className="absolute -right-1 top-0.5 size-[15px] select-none" draggable={false} />
        </span>
      ))}
    </div>
  );
}
