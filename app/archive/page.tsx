import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Trophy } from "lucide-react";
import { getResolvedMarkets } from "@/services/prediction-service";
import { parseMarketOptions } from "@/lib/market/utils";
import type { PredictionMarketRow } from "@/lib/supabase/types";

export const metadata: Metadata = {
  title: "Archive — Octo Market",
  description: "All resolved prediction markets on Octo Market.",
};

export const revalidate = 60;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

function getWinningLabel(market: PredictionMarketRow): string {
  if (!market.resolution_outcome_id) return "—";
  const options = parseMarketOptions(market.options);
  const winner = options.find((o) => o.id === market.resolution_outcome_id);
  return winner?.label ?? market.resolution_outcome_id;
}

function getMarketHref(market: PredictionMarketRow): string {
  return `/markets/${market.slug ?? market.id}`;
}

// ─── MarketCard ───────────────────────────────────────────────────────────────

function MarketCard({ market }: { market: PredictionMarketRow }) {
  const winningLabel = getWinningLabel(market);
  const isVs = market.visual_type === "vs";

  return (
    <Link
      href={getMarketHref(market)}
      className="group block rounded-2xl border border-border bg-card p-4 transition-all hover:border-orange-300 hover:shadow-md dark:hover:border-orange-700/50"
    >
      {/* VS image row */}
      {isVs && (
        <div className="mb-3 flex items-center justify-center gap-3">
          {market.left_competitor_image_src && (
            <div className="relative size-10 overflow-hidden rounded-full border border-border">
              <Image
                src={market.left_competitor_image_src}
                alt={market.left_competitor_name ?? ""}
                fill
                className="object-cover"
                sizes="40px"
              />
            </div>
          )}
          <span className="text-xs font-bold text-muted-foreground">VS</span>
          {market.right_competitor_image_src && (
            <div className="relative size-10 overflow-hidden rounded-full border border-border">
              <Image
                src={market.right_competitor_image_src}
                alt={market.right_competitor_name ?? ""}
                fill
                className="object-cover"
                sizes="40px"
              />
            </div>
          )}
        </div>
      )}

      {/* Single image */}
      {!isVs && market.single_image_src && (
        <div className="relative mb-3 h-20 w-full overflow-hidden rounded-xl">
          <Image
            src={market.single_image_src}
            alt={market.single_name ?? market.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 300px"
          />
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-semibold leading-5 text-foreground group-hover:text-orange-600 dark:group-hover:text-orange-400 line-clamp-2">
        {market.title}
      </p>

      {/* Outcome */}
      <div className="mt-2 flex items-center gap-1.5">
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 truncate">
          {winningLabel}
        </span>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {market.category_id}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatDate(market.resolved_at)}
        </span>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;

  const markets = await getResolvedMarkets(200);

  // All distinct categories from resolved markets
  const categories = Array.from(new Set(markets.map((m) => m.category_id))).sort();

  // Filter if category selected
  const filtered =
    category && category !== "all"
      ? markets.filter((m) => m.category_id === category)
      : markets;

  // Group by year-month for timeline display
  const grouped = filtered.reduce<Record<string, PredictionMarketRow[]>>((acc, m) => {
    const key = m.resolved_at
      ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
          new Date(m.resolved_at)
        )
      : "Date inconnue";
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Trophy className="size-8 shrink-0 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Market Archive</h1>
          <p className="text-sm text-muted-foreground">
            {markets.length} resolved market{markets.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Category filter */}
      {categories.length > 1 && (
        <div className="mb-8 flex flex-wrap gap-2">
          <Link
            href="/archive"
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              !category || category === "all"
                ? "border-orange-400 bg-orange-500 text-white"
                : "border-border bg-card text-muted-foreground hover:border-orange-300 hover:text-foreground"
            }`}
          >
            All ({markets.length})
          </Link>
          {categories.map((cat) => {
            const count = markets.filter((m) => m.category_id === cat).length;
            const active = category === cat;
            return (
              <Link
                key={cat}
                href={`/archive?category=${cat}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  active
                    ? "border-orange-400 bg-orange-500 text-white"
                    : "border-border bg-card text-muted-foreground hover:border-orange-300 hover:text-foreground"
                }`}
              >
                {cat} ({count})
              </Link>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="py-20 text-center text-muted-foreground">
          <Trophy className="mx-auto mb-3 size-10 opacity-30" />
          <p>No resolved markets in this category.</p>
        </div>
      )}

      {/* Timeline groups */}
      {Object.entries(grouped).map(([monthLabel, groupMarkets]) => (
        <section key={monthLabel} className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="flex-1 border-t border-border" />
            <span className="capitalize">{monthLabel}</span>
            <span className="flex-1 border-t border-border" />
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {groupMarkets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
