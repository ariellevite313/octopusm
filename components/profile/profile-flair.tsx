/* eslint-disable @next/next/no-img-element */
/** Animations de profil : contour animé autour de l'avatar et mascottes Omero qui dépassent de la bannière. */
import { OCTO_TIERS } from "@/components/leaderboard/octo-tier-badge";
import type { FrameId } from "@/lib/profile-cosmetics";

const BADGE: Record<string, string> = { Blue: "blue", Green: "green", Yellow: "yellow", Orange: "orange", Red: "red" };

/** Entoure l'avatar du contour choisi (aucun contour : l'avatar seul). */
export function FrameWrap({ frame, children }: { frame: FrameId | null; children: React.ReactNode }) {
  if (!frame) return <>{children}</>;
  return <span className={`om-frame om-frame-${frame}`}>{children}</span>;
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
