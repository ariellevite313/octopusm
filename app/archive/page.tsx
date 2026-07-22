import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Trophy } from "lucide-react";
import { getResolvedMarkets } from "@/services/prediction-service";
import { parseMarketOptions } from "@/lib/market/utils";
import { createAdminClient } from "@/lib/supabase/server";
import type { PredictionMarketRow, MutuelMarketRow, MutuelOption } from "@/lib/supabase/types";
import { TokenAmount } from "@/components/shared/token-logo";

export const metadata: Metadata = {
  title: "Archive — OMdotfun",
  description: "All resolved prediction markets and pool predictions on OMdotfun.",
  alternates: { canonical: "https://omdot.fun/archive" },
  openGraph: {
    title: "Archive | OMdotfun",
    description: "All resolved prediction markets and pool predictions on OMdotfun.",
    url: "https://omdot.fun/archive",
    type: "website",
    images: [{ url: "/branding-logo.jpeg", width: 1200, height: 630, alt: "OMdotfun Archive" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Archive | OMdotfun",
    description: "All resolved prediction markets and pool predictions on OMdotfun.",
    images: ["/branding-logo.jpeg"],
  },
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

function monthKey(dateStr: string | null): string {
  if (!dateStr) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(dateStr),
  );
}

// Unified entry type for the archive
type ArchiveEntry =
  | { kind: "prediction"; market: PredictionMarketRow; resolvedAt: string | null; category: string }
  | { kind: "pool";       market: MutuelMarketRow;      resolvedAt: string | null; category: string };

// ─── Prediction market card ───────────────────────────────────────────────────

function PredictionCard({ market }: { market: PredictionMarketRow }) {
  const options = parseMarketOptions(market.options);
  const winner = options.find((o) => o.id === market.resolution_outcome_id);
  const winningLabel = winner?.label ?? market.resolution_outcome_id ?? "—";
  const isVs = market.visual_type === "vs";
  const href = `/markets/${market.slug ?? market.id}`;

  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-border bg-card p-4 transition-all hover:border-orange-300 hover:shadow-md dark:hover:border-orange-700/50"
    >
      {isVs && (
        <div className="mb-3 flex items-center justify-center gap-3">
          {market.left_competitor_image_src && (
            <div className="relative size-10 overflow-hidden rounded-full border border-border">
              <Image src={market.left_competitor_image_src} alt={market.left_competitor_name ?? ""} fill className="object-cover" sizes="40px" />
            </div>
          )}
          <span className="text-xs font-bold text-muted-foreground">VS</span>
          {market.right_competitor_image_src && (
            <div className="relative size-10 overflow-hidden rounded-full border border-border">
              <Image src={market.right_competitor_image_src} alt={market.right_competitor_name ?? ""} fill className="object-cover" sizes="40px" />
            </div>
          )}
        </div>
      )}

      {!isVs && market.single_image_src && (
        <div className="relative mb-3 h-20 w-full overflow-hidden rounded-xl">
          <Image src={market.single_image_src} alt={market.single_name ?? market.title} fill className="object-cover" sizes="(max-width: 640px) 100vw, 300px" />
        </div>
      )}

      <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground group-hover:text-orange-600 dark:group-hover:text-orange-400">
        {market.title}
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
        <span className="truncate text-xs font-medium text-emerald-600 dark:text-emerald-400">
          {winningLabel}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {market.category_id}
        </span>
        <span className="text-[10px] text-muted-foreground">{formatDate(market.resolved_at)}</span>
      </div>
    </Link>
  );
}

// ─── Pool market card ─────────────────────────────────────────────────────────

function PoolCard({ market }: { market: MutuelMarketRow }) {
  const options = (market.options ?? []) as MutuelOption[];
  const winner = options.find((o) => o.id === market.winning_option_id);
  const winningLabel = winner?.label ?? "—";
  const pool =
    market.bet_token === "usdc"
      ? `${market.total_pool_usdc.toFixed(2)} USDC`
      : `${market.total_pool_clt.toFixed(0)} CLT`;
  const href = `/pools/${market.slug}`;

  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-orange-200 bg-orange-50/60 p-4 transition-all hover:border-orange-400 hover:shadow-md dark:border-orange-900/30 dark:bg-orange-950/5 dark:hover:border-orange-700/60"
    >
      {/* Icon + title */}
      <div className="mb-3 flex items-center gap-2.5">
        {market.cover_image_src ? (
          <div className="size-9 shrink-0 overflow-hidden rounded-xl border border-orange-200 dark:border-orange-900/40">
            <img src={market.cover_image_src} alt="" className="size-9 object-cover" />
          </div>
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-100 text-base dark:border-orange-900/40 dark:bg-orange-950/30">
            🎱
          </div>
        )}
        <span className="text-[10px] font-semibold uppercase tracking-widest text-orange-500">
          Bookmake · {market.category}
        </span>
      </div>

      <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground group-hover:text-orange-600 dark:group-hover:text-orange-400">
        {market.title}
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        <Trophy className="size-3.5 shrink-0 text-orange-500" />
        <span className="truncate text-xs font-medium text-orange-600 dark:text-orange-400">
          {winningLabel}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
          Pool ·&nbsp;<TokenAmount amount={market.bet_token === "usdc" ? market.total_pool_usdc.toFixed(2) : market.total_pool_clt.toFixed(0)} token={market.bet_token} logoClass="size-3" />
        </span>
        <span className="text-[10px] text-muted-foreground">{formatDate(market.resolved_at)}</span>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function getResolvedPools(): Promise<MutuelMarketRow[]> {
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("mutuel_markets")
    .select("id, slug, title, description, cover_image_src, options, category, status, bet_token, total_pool_usdc, total_pool_clt, bet_count, winning_option_id, resolved_at, created_at")
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false })
    .limit(200);
  return (data ?? []) as MutuelMarketRow[];
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; type?: string }>;
}) {
  const { category, type } = await searchParams;

  const [predictions, pools] = await Promise.all([
    getResolvedMarkets(200),
    getResolvedPools(),
  ]);

  // Build unified list
  const allEntries: ArchiveEntry[] = [
    ...predictions.map((m) => ({
      kind: "prediction" as const,
      market: m,
      resolvedAt: m.resolved_at,
      category: m.category_id,
    })),
    ...pools.map((m) => ({
      kind: "pool" as const,
      market: m,
      resolvedAt: m.resolved_at,
      category: m.category,
    })),
  ].sort((a, b) => {
    const ta = a.resolvedAt ? new Date(a.resolvedAt).getTime() : 0;
    const tb = b.resolvedAt ? new Date(b.resolvedAt).getTime() : 0;
    return tb - ta;
  });

  // All categories
  const categories = Array.from(new Set(allEntries.map((e) => e.category))).sort();

  // Filter by type and/or category
  const filtered = allEntries.filter((e) => {
    if (type && type !== "all" && e.kind !== type) return false;
    if (category && category !== "all" && e.category !== category) return false;
    return true;
  });

  // Group by month
  const grouped = filtered.reduce<Record<string, ArchiveEntry[]>>((acc, e) => {
    const key = monthKey(e.resolvedAt);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const totalPredictions = predictions.length;
  const totalPools = pools.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Trophy className="size-8 shrink-0 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Market Archive</h1>
          <p className="text-sm text-muted-foreground">
            {totalPredictions} prediction{totalPredictions !== 1 ? "s" : ""} · {totalPools} pool{totalPools !== 1 ? "s" : ""} resolved
          </p>
        </div>
      </div>

      {/* Type filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "prediction", "pool"] as const).map((t) => {
          const count =
            t === "all" ? allEntries.length
            : t === "prediction" ? totalPredictions
            : totalPools;
          const active = !type || type === "all" ? t === "all" : type === t;
          const href = t === "all" ? "/archive" : `/archive?type=${t}${category && category !== "all" ? `&category=${category}` : ""}`;
          return (
            <Link
              key={t}
              href={href}
              className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                active
                  ? "border-orange-400 bg-orange-500 text-white"
                  : "border-border bg-card text-muted-foreground hover:border-orange-300 hover:text-foreground"
              }`}
            >
              {t === "prediction" ? "Predictions" : t === "pool" ? "Bookmake" : "All"} ({count})
            </Link>
          );
        })}
      </div>

      {/* Category filter */}
      {categories.length > 1 && (
        <div className="mb-8 flex flex-wrap gap-2">
          <Link
            href={type && type !== "all" ? `/archive?type=${type}` : "/archive"}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              !category || category === "all"
                ? "border-orange-400 bg-orange-500 text-white"
                : "border-border bg-card text-muted-foreground hover:border-orange-300 hover:text-foreground"
            }`}
          >
            All categories
          </Link>
          {categories.map((cat) => {
            const count = allEntries.filter((e) => e.category === cat && (!type || type === "all" || e.kind === type)).length;
            const active = category === cat;
            const href = `/archive?category=${cat}${type && type !== "all" ? `&type=${type}` : ""}`;
            return (
              <Link
                key={cat}
                href={href}
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
          <p>No resolved markets here yet.</p>
        </div>
      )}

      {/* Timeline groups */}
      {Object.entries(grouped).map(([monthLabel, groupEntries]) => (
        <section key={monthLabel} className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="flex-1 border-t border-border" />
            <span className="capitalize">{monthLabel}</span>
            <span className="flex-1 border-t border-border" />
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {groupEntries.map((entry) =>
              entry.kind === "prediction" ? (
                <PredictionCard key={entry.market.id} market={entry.market} />
              ) : (
                <PoolCard key={entry.market.id} market={entry.market} />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
