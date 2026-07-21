import Link from "next/link";

const CATEGORY_LABELS: Record<string, string> = {
  crypto:        "Crypto",
  sports:        "Sports",
  politics:      "Politics",
  entertainment: "Entertainment",
  cinema:        "Cinema",
  science:       "Science",
  other:         "Other",
};

function label(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

type Props = {
  categories: string[];
  active: string; // "all" | category slug
};

export function CategoryNav({ categories, active }: Props) {
  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4">
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
            {label(cat)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
