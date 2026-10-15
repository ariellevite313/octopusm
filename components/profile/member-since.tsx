"use client";

import { useT } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n-mark";

export function MemberSince({ iso }: { iso: string }) {
  const { tr, lang } = useT();
  const date = new Date(iso).toLocaleDateString(LOCALES[lang], { month: "short", day: "numeric", year: "numeric" });
  return <>{tr("Member since {date}", { date })}</>;
}
