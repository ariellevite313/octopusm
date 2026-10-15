"use client";

import { useT } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n-mark";

/** Date formatée dans la langue choisie (utilisable depuis un composant serveur). */
export function LocalizedDate({ iso, variant = "day" }: { iso: string | null; variant?: "day" | "month" }) {
  const { lang } = useT();
  if (!iso) return <>—</>;
  const opts: Intl.DateTimeFormatOptions =
    variant === "month"
      ? { month: "long", year: "numeric" }
      : { day: "numeric", month: "short", year: "numeric" };
  return <>{new Intl.DateTimeFormat(LOCALES[lang], opts).format(new Date(iso))}</>;
}
