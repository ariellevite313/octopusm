import Link from "next/link";
import { getCategoryLabel } from "@/lib/categories";

type Props = {
  categories: string[];
  active: string; // "all" | "updown" | category slug
};

export function CategoryNav({ categories, active }: Props) {
  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4 scrollbar-hide [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        <Link
          href="/"
          className={`shrink-0 py-3 text-sm font-medium transition-colors ${
            active === "all"
              ? "text-orange-500"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          All
        </Link>
        <Link
          href="/updown"
          className={`shrink-0 py-3 text-sm font-medium transition-colors ${
            active === "updown"
              ? "text-orange-500"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Up/Down
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat}
            href={`/${cat}`}
            className={`shrink-0 py-3 text-sm font-medium transition-colors ${
              active === cat
                ? "text-orange-500"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {getCategoryLabel(cat)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
