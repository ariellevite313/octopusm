"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { LaunchpadToken } from "@/services/launchpad-service";

const CATEGORIES = ["All", "Meme", "Utility", "AI", "Gaming", "DeFi", "NFT", "x402"];

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  active:     { label: "Live",       class: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  graduating: { label: "Graduating", class: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  graduated:  { label: "Graduated",  class: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  pending:    { label: "Pending",    class: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" },
  cancelled:  { label: "Cancelled",  class: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
};

function TokenCard({ token }: { token: LaunchpadToken }) {
  const badge = STATUS_BADGE[token.status] ?? STATUS_BADGE.pending;

  return (
    <Link
      href={`/launchpad/${token.id}`}
      className="group flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3 transition-all hover:border-primary/40 hover:shadow-sm"
    >
      {/* Logo + badge */}
      <div className="flex items-start justify-between">
        {token.logo_url ? (
          <Image
            src={token.logo_url}
            alt={token.name}
            width={44}
            height={44}
            className="rounded-xl object-cover"
            unoptimized
          />
        ) : (
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-base font-bold text-primary">
            {token.ticker.slice(0, 2)}
          </div>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.class}`}>
          {badge.label}
        </span>
      </div>

      {/* Name + ticker */}
      <div>
        <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          {token.name}
        </p>
        <p className="text-xs text-muted-foreground">${token.ticker}</p>
      </div>

      {/* Category + fee */}
      <div className="flex items-center justify-between">
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {token.category}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {token.creator_fee_pct * 2}% fee
        </span>
      </div>

      {/* Scheduled badge */}
      {token.is_scheduled && !token.is_tradeable && token.scheduled_at && (
        <div className="rounded-lg bg-violet-50 dark:bg-violet-900/20 px-2 py-1 text-[10px] font-medium text-violet-700 dark:text-violet-400 text-center">
          Launches {new Date(token.scheduled_at).toLocaleDateString()}
        </div>
      )}
    </Link>
  );
}

export function LaunchpadClient({ initialTokens }: { initialTokens: LaunchpadToken[] }) {
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = initialTokens.filter((t) => {
    const matchCat = category === "All" || t.category === category;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.ticker.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-5">
      {/* Filtres */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or ticker…"
          className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-64"
        />
        {/* Categories */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-3xl mb-3">🚀</p>
          <p className="text-sm font-medium text-foreground mb-1">No tokens yet</p>
          <p className="text-xs text-muted-foreground mb-5">Be the first to launch a token on OMdotfun</p>
          <Link
            href="/launchpad/create"
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Launch a token
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((token) => (
            <TokenCard key={token.id} token={token} />
          ))}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {filtered.length} token{filtered.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
