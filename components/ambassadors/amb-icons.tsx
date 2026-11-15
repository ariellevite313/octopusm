/**
 * Icônes du programme ambassadeur : objets gris en relief doux sur fond sombre, petits losanges autour.
 * Dessinées pour OM (aucune image externe). Taille fixe 96 px, s'adaptent au thème clair comme sombre.
 */
import { WORLD_COLS, WORLD_DOTS, WORLD_ROWS } from "@/lib/world-dots";

const Defs = ({ id }: { id: string }) => (
  <defs>
    <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fafafa" /><stop offset="1" stopColor="#b9b9b9" />
    </linearGradient>
    <linearGradient id={`${id}-d`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#4a4a4a" /><stop offset="1" stopColor="#1c1c1c" />
    </linearGradient>
  </defs>
);
const Diamond = ({ x, y, s = 7 }: { x: number; y: number; s?: number }) => (
  <rect x={x - s / 2} y={y - s / 2} width={s} height={s} transform={`rotate(45 ${x} ${y})`} fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.5" />
);
const Spark = ({ x, y }: { x: number; y: number }) => (
  <path d={`M${x} ${y - 6}V${y + 6}M${x - 6} ${y}H${x + 6}M${x - 4} ${y - 4}L${x + 4} ${y + 4}M${x + 4} ${y - 4}L${x - 4} ${y + 4}`} stroke="currentColor" strokeOpacity=".4" strokeWidth="1.2" strokeLinecap="round" />
);
type P = { className?: string };
const box = "size-24 text-foreground";

/** Part des frais : pièce avec % */
export function IconShare({ className = box }: P) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden>
      <Defs id="sh" />
      <circle cx="48" cy="50" r="30" fill="url(#sh-s)" />
      <circle cx="48" cy="50" r="30" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1" />
      <circle cx="39" cy="41" r="5.5" fill="none" stroke="#1d1d1d" strokeWidth="4.5" />
      <circle cx="57" cy="59" r="5.5" fill="none" stroke="#1d1d1d" strokeWidth="4.5" />
      <path d="M58 38L38 62" stroke="#1d1d1d" strokeWidth="5" strokeLinecap="round" />
      <Diamond x={14} y={20} /><Diamond x={84} y={82} s={9} />
    </svg>
  );
}

/** Bonus Omero : coffret cadeau */
export function IconGift({ className = box }: P) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden>
      <Defs id="gf" />
      <rect x="22" y="44" width="52" height="34" rx="5" fill="url(#gf-s)" />
      <rect x="18" y="32" width="60" height="14" rx="4" fill="url(#gf-s)" />
      <rect x="43" y="32" width="10" height="46" fill="url(#gf-d)" />
      <path d="M48 31C40 18 27 21 31 28c2 4 10 4 17 3zM48 31c8-13 21-10 17-3-2 4-10 4-17 3z" fill="none" stroke="currentColor" strokeOpacity=".7" strokeWidth="3" strokeLinejoin="round" />
      <Spark x={80} y={18} /><Diamond x={12} y={74} />
    </svg>
  );
}

/** Badge ambassadeur : carte sombre avec coche */
export function IconBadge({ className = box }: P) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden>
      <Defs id="bd" />
      <circle cx="56" cy="30" r="14" fill="url(#bd-s)" />
      <path d="M56 24v12M50 30h12" stroke="#1d1d1d" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="18" y="38" width="62" height="40" rx="6" fill="url(#bd-d)" stroke="#fff" strokeOpacity=".18" />
      <path d="M30 58l6 6 12-13" fill="none" stroke="#f2f2f2" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="54" y="53" width="18" height="3.5" rx="1.75" fill="#f2f2f2" fillOpacity=".7" />
      <rect x="54" y="61" width="12" height="3.5" rx="1.75" fill="#f2f2f2" fillOpacity=".4" />
      <Diamond x={22} y={22} s={6} />
    </svg>
  );
}

/** Communauté : deux bulles avec personnes */
export function IconCommunity({ className = box }: P) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden>
      <Defs id="cm" />
      <path d="M28 14h52a5 5 0 015 5v34a5 5 0 01-5 5H34a5 5 0 01-5-5V24l-8-10z" fill="url(#cm-s)" />
      <circle cx="56" cy="30" r="7" fill="url(#cm-d)" /><path d="M43 50a13 11 0 0126 0z" fill="url(#cm-d)" />
      <path d="M12 52h34a4 4 0 014 4v22a4 4 0 01-4 4H18l-6 6z" fill="url(#cm-s)" stroke="#000" strokeOpacity=".08" />
      <circle cx="31" cy="63" r="4.5" fill="url(#cm-d)" /><path d="M23 76a8 7 0 0116 0z" fill="url(#cm-d)" />
      <Diamond x={78} y={78} s={9} />
    </svg>
  );
}

/** Partenaire indépendant : drapeau */
export function IconFlag({ className = box }: P) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden>
      <Defs id="fl" />
      <path d="M30 20l38 6-8 14 10 12-40-4z" fill="url(#fl-s)" />
      <rect x="27" y="16" width="5" height="64" rx="2.5" fill="url(#fl-s)" stroke="#000" strokeOpacity=".1" />
      <rect x="20" y="78" width="19" height="6" rx="2" fill="url(#fl-s)" />
      <Diamond x={76} y={70} /><Spark x={78} y={22} />
    </svg>
  );
}

/** Lien personnel : maillons */
export function IconLink({ className = box }: P) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden>
      <Defs id="lk" />
      <rect x="12" y="38" width="42" height="22" rx="11" transform="rotate(-35 33 49)" fill="none" stroke="url(#lk-s)" strokeWidth="9" />
      <rect x="42" y="38" width="42" height="22" rx="11" transform="rotate(-35 63 49)" fill="none" stroke="url(#lk-d)" strokeWidth="9" />
      <Diamond x={18} y={18} /><Diamond x={82} y={80} s={9} />
    </svg>
  );
}

/** Récompenses par activité réelle : barres montantes */
export function IconTiers({ className = box }: P) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden>
      <Defs id="tr" />
      <rect x="18" y="56" width="16" height="24" rx="3" fill="url(#tr-d)" />
      <rect x="40" y="42" width="16" height="38" rx="3" fill="url(#tr-s)" />
      <rect x="62" y="24" width="16" height="56" rx="3" fill="url(#tr-s)" />
      <Spark x={24} y={30} /><Diamond x={86} y={14} s={6} />
    </svg>
  );
}

/** Profil recherché : loupe sur une personne */
export function IconSeek({ className = box }: P) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden>
      <Defs id="sk" />
      <circle cx="42" cy="42" r="24" fill="url(#sk-s)" />
      <circle cx="42" cy="36" r="7" fill="url(#sk-d)" /><path d="M29 56a13 11 0 0126 0z" fill="url(#sk-d)" />
      <path d="M60 60l16 16" stroke="url(#sk-d)" strokeWidth="9" strokeLinecap="round" />
      <Diamond x={80} y={20} />
    </svg>
  );
}

/** Carte du monde en points (gris en relief, comme les icônes) */
export function WorldDots({ className = "w-full text-foreground" }: P) {
  const S = 10;
  const pts: string[] = [];
  for (let i = 0; i < WORLD_DOTS.length; i += 2) pts.push(`M${WORLD_DOTS[i] * S + S / 2} ${WORLD_DOTS[i + 1] * S + S / 2}h0`);
  return (
    <svg viewBox={`0 0 ${WORLD_COLS * S} ${WORLD_ROWS * S}`} className={className} aria-hidden>
      <defs>
        <linearGradient id="wd" x1="0" y1="0" x2="0" y2={WORLD_ROWS * S} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="currentColor" stopOpacity=".75" /><stop offset="1" stopColor="currentColor" stopOpacity=".3" />
        </linearGradient>
      </defs>
      <path d={pts.join("")} stroke="url(#wd)" strokeWidth={S * 0.62} strokeLinecap="round" />
    </svg>
  );
}
