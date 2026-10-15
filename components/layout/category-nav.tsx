"use client";

import Link from "next/link";
import { getCategoryLabel } from "@/lib/categories";
import { useT } from "@/lib/i18n";

type Props = {
  categories: string[];
  active: string; // "all" | "updown" | category slug
};

export function CategoryNav({ categories, active }: Props) {
  const { tr } = useT();
  return (
    <nav className="mb-6 border-b border-border/60 bg-background">
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 scrollbar-hide [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        <Link
          href="/prediction"
          className={`chip shrink-0 ${
            active === "all"
              ? "chip-active"
              : ""
          }`}
        >
          {tr("All")}
        </Link>
        <Link
          href="/updown"
          className={`chip shrink-0 ${
            active === "updown"
              ? "chip-active"
              : ""
          }`}
        >
          {tr("Up/Down")}
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat}
            href={`/${cat}`}
            className={`chip shrink-0 ${
              active === cat
                ? "chip-active"
                : ""
            }`}
          >
            {tr(getCategoryLabel(cat))}
          </Link>
        ))}
      </div>
    </nav>
  );
}
