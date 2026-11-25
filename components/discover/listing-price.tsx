"use client";

import { useT } from "@/lib/i18n";
import { LISTING_FREE_NOW, LISTING_PRICE_USD } from "@/lib/discover";

/** Prix de la vitrine Discover : « Gratuit » en grand, le prix normal barré à côté, et l'étiquette de l'offre. */
export function ListingPrice({ align = "end" }: { align?: "start" | "end" }) {
  const { tr } = useT();
  const normal = <span className="num whitespace-nowrap text-[13px] font-semibold text-muted-foreground">${LISTING_PRICE_USD}<span className="font-medium">/{tr("year")}</span></span>;
  if (!LISTING_FREE_NOW) return <span className="num text-[20px] font-bold">${LISTING_PRICE_USD}<span className="text-[13px] font-semibold text-muted-foreground">/{tr("year")}</span></span>;
  return (
    <span className={`flex flex-col gap-1 ${align === "end" ? "items-end" : "items-start"}`}>
      <span className="rounded-full bg-foreground px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-wider text-background">{tr("Launch offer")}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-[22px] font-extrabold leading-none tracking-tight">{tr("Free")}</span>
        <span className="relative">
          {normal}
          <span aria-hidden className="absolute left-[-2px] right-[-2px] top-1/2 h-[1.5px] -rotate-[8deg] rounded bg-muted-foreground" />
        </span>
      </span>
    </span>
  );
}
