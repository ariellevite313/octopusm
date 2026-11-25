/** Bonbon Omero : blanc (10 OMERO) ou orange (100 OMERO). Image détourée fournie (fond transparent), bâton compris. */
import { splitBonbons } from "@/lib/bonbons";

export function BonbonIcon({ kind, className = "h-5" }: { kind: "white" | "orange"; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={kind === "orange" ? "/bonbon-orange.png" : "/bonbon-white.png"} alt="" aria-hidden className={`${className} w-auto shrink-0 object-contain`} />;
}

/** Les bonbons d'un montant : icône + quantité pour chaque couleur donnée. */
export function BonbonCount({ amount, className = "h-8" }: { amount: number; className?: string }) {
  const { orange, white } = splitBonbons(amount);
  if (!orange && !white) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      {orange > 0 && <span className="inline-flex items-center gap-0.5"><BonbonIcon kind="orange" className={className} /><span className="num text-[12px] font-bold">×{orange}</span></span>}
      {white > 0 && <span className="inline-flex items-center gap-0.5"><BonbonIcon kind="white" className={className} /><span className="num text-[12px] font-bold">×{white}</span></span>}
    </span>
  );
}
