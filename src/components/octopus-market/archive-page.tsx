import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock3, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OctopusBrand } from "@/components/octopus-market/octopus-brand";
import { ThemeToggle } from "@/components/octopus-market/theme-toggle";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { getResolvedMarkets } from "@/services/supabase/prediction-service";
import type { PredictionMarketRow } from "@/lib/supabase-types";
import type { PredictionMarketOption } from "@/components/octopus-market/octopus-market-data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatResolvedDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function formatEventDate(market: PredictionMarketRow): string | null {
  if (market.event_start_at) {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    }).format(new Date(market.event_start_at));
  }
  return market.event_date_label ?? null;
}

function parseOptions(market: PredictionMarketRow): PredictionMarketOption[] {
  return Array.isArray(market.options)
    ? (market.options as unknown as PredictionMarketOption[])
    : [];
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ArchiveSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-3xl border border-orange-100 bg-orange-50 dark:border-white/5 dark:bg-white/5"
        />
      ))}
    </div>
  );
}

// ─── Market card (read-only) ──────────────────────────────────────────────────

function ArchivedMarketCard({ market }: { market: PredictionMarketRow }) {
  const options = parseOptions(market);
  const eventDate = formatEventDate(market);

  return (
    <Card className="border-orange-200 bg-white text-zinc-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Resolved badge */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:border-white/10 dark:bg-white/10 dark:text-zinc-300">
            <CheckCircle2 className="size-3" />
            Resolved
            {market.resolved_at ? ` · ${formatResolvedDate(market.resolved_at)}` : ""}
          </span>
          {/* Event date chip */}
          {eventDate ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-300">
              <Clock3 className="size-3" />
              {eventDate}
            </span>
          ) : null}
        </div>
        <CardTitle className="mt-2 text-lg leading-snug">{market.title}</CardTitle>
        {market.resolution_label ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{market.resolution_label}</p>
        ) : null}
      </CardHeader>

      <CardContent>
        <div className={`grid gap-3 ${options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {options.map((option) => {
            const isWinner = option.id === market.resolution_outcome_id;
            return (
              <div
                key={option.id}
                className={`relative rounded-2xl border px-4 py-3 transition-none ${
                  isWinner
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/15"
                    : "border-orange-100 bg-orange-50/50 dark:border-white/10 dark:bg-white/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {option.logoSrc ? (
                      <img
                        src={option.logoSrc}
                        alt={option.label}
                        className="size-8 rounded-full border border-white/60 object-cover"
                      />
                    ) : null}
                    <p
                      className={`font-semibold ${
                        isWinner ? "text-emerald-800 dark:text-emerald-300" : "text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {option.label}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-medium ${isWinner ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                    x{option.oddsMultiplier}
                  </p>
                </div>

                {isWinner ? (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-300">
                    <Trophy className="size-3" />
                    Winner
                  </div>
                ) : null}

                {option.description ? (
                  <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{option.description}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Archive page ──────────────────────────────────────────────────────────────

export function ArchivePage() {
  const { isDark, toggleTheme } = useThemeMode();
  const [markets, setMarkets] = useState<PredictionMarketRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getResolvedMarkets().then((data) => {
      if (!cancelled) {
        setMarkets(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-white text-zinc-950 dark:bg-zinc-950 dark:text-white">
      {/* Background gradient */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 select-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(249,115,22,0.13) 0%, transparent 70%)",
        }}
      />

      {/* Sticky nav */}
      <header className="sticky top-0 z-40 border-b border-orange-200/60 bg-white/90 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <OctopusBrand compact />
            <Separator orientation="vertical" className="h-5 bg-orange-200 dark:bg-white/10" />
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Previous markets
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-2xl border border-orange-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="size-4" />
              Back to markets
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 mx-auto max-w-[92rem] px-4 py-10 sm:px-6 lg:px-8">
        {/* Page heading */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-300">
            <Trophy className="size-3" />
            Resolved markets
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
            Previous markets
          </h1>
          <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
            All prediction markets resolved by the admin, with the winning outcome.
          </p>
        </div>

        {loading ? (
          <ArchiveSkeleton />
        ) : markets.length === 0 ? (
          <div className="rounded-3xl border border-orange-200 bg-orange-50 px-6 py-14 text-center dark:border-white/10 dark:bg-white/5">
            <Trophy className="mx-auto size-8 text-orange-400 dark:text-orange-300" />
            <p className="mt-4 text-base font-semibold text-zinc-700 dark:text-zinc-200">
              No resolved markets yet
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Resolved markets will appear here once the admin closes them.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {markets.map((market) => (
              <ArchivedMarketCard key={market.id} market={market} />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-16 border-t border-orange-200 bg-white/95 py-8 dark:border-white/10 dark:bg-zinc-900/95">
        <div className="mx-auto max-w-[92rem] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between dark:text-zinc-300">
            <span>© 2026 Octopus Market · All rights reserved</span>
            <Link
              to="/"
              className="text-orange-600 hover:underline dark:text-orange-300"
            >
              ← Back to markets
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
