"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

const TABS = [
  { href: "/hackathon",             label: T("Home") },
  { href: "/hackathon/infos",       label: T("Info") },
  { href: "/hackathon/classement",  label: T("Leaderboard") },
  { href: "/hackathon/mes-votes",   label: T("My votes") },
];

/** Onglets du hackathon : une seule ligne qui défile de côté. */
export function HackathonNav() {
  const { tr } = useT();
  const path = usePathname();
  return (
    <nav className="mb-6 flex gap-6 overflow-x-auto [scrollbar-width:none]">
      {TABS.map((t) => {
        const on = t.href === "/hackathon" ? path === "/hackathon" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`shrink-0 border-b-2 py-2 text-[15px] ${on ? "border-foreground font-bold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground"}`}>
            {tr(t.label)}
          </Link>
        );
      })}
    </nav>
  );
}
