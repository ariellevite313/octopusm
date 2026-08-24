"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { LayoutGrid, List, Copy, Check, BadgeCheck, Users, Bell } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import type { LaunchpadToken } from "@/services/launchpad-service";

// ── helpers ───────────────────────────────────────────────────────────────────

function shortAddr(address: string, head = 4, tail = 4) {
  if (!address || address.length < head + tail + 3) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}S`;
  if (diff < 3600) return `${Math.floor(diff / 60)}M`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}H`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}D`;
  return `${Math.floor(diff / (86400 * 30))}MO`;
}

function fmtMcap(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000)     return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000)         return `$${(usd / 1_000).toFixed(2)}k`;
  return `$${usd.toFixed(0)}`;
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text, children }: { text: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("CA copié !", {
        description: `${text.slice(0, 8)}…${text.slice(-6)}`,
        duration: 2000,
      });
    });
  }, [text]);
  return (
    <button
      onClick={copy}
      className="flex items-center gap-0.5 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
      title="Copier le CA"
    >
      {copied
        ? <Check className="size-3 text-emerald-400" />
        : <Copy className="size-3" />
      }
      {children && (
        <span className="text-[10px] font-mono">{children}</span>
      )}
    </button>
  );
}

function fmtHolders(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── TokenStats (lazy fetch via internal API — avoids GeckoTerminal rate-limits) ─
// Using /api/launchpad/token-stats/[mint] which batches GT + RPC holder count server-side.
// Each card staggered by a small random delay so requests don't all fire simultaneously.

function TokenStats({ mintAddress }: { mintAddress: string | null }) {
  const [mcap,    setMcap]    = useState<number | null>(null);
  const [holders, setHolders] = useState<number | null>(null);

  useEffect(() => {
    if (!mintAddress) return;
    let cancelled = false;
    // Stagger requests: 0–600 ms random delay to spread server-side GT calls
    const delay = Math.floor(Math.random() * 600);
    const timer = setTimeout(() => {
      fetch(`/api/launchpad/token-stats/${mintAddress}`)
        .then(r => r.ok ? r.json() : null)
        .then((json: { marketCap?: number | null; fdv?: number | null; holders?: number | null } | null) => {
          if (cancelled || !json) return;
          const rawMcap = json.marketCap ?? json.fdv ?? null;
          if (rawMcap) setMcap(rawMcap);
          if (json.holders) setHolders(json.holders);
        })
        .catch(() => {});
    }, delay);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mintAddress]);

  if (mcap === null && holders === null) return null;

  return (
    <div className="flex items-center gap-2">
      {holders !== null && (
        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
          <Users className="size-2.5" />
          {fmtHolders(holders)}
        </span>
      )}
      {mcap !== null && (
        <span className="text-xs font-bold text-emerald-400">{fmtMcap(mcap)}</span>
      )}
    </div>
  );
}

// ── constants ─────────────────────────────────────────────────────────────────

type SortTab = "all" | "new" | "graduated" | "scheduled" | "watchlist";

const SORT_TABS: { id: SortTab; label: string; icon?: React.ReactNode }[] = [
  { id: "all",       label: "All" },
  { id: "new",       label: "New" },
  { id: "graduated", label: "Graduated" },
  { id: "scheduled", label: "Scheduled" },
  { id: "watchlist", label: "Watchlist", icon: <Bell className="size-3" /> },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:     { label: "Live",       cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" },
  graduating: { label: "Graduating", cls: "bg-amber-500/15 text-amber-400 border border-amber-500/30" },
  graduated:  { label: "Graduated",  cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
  pending:    { label: "Pending",    cls: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30" },
  cancelled:  { label: "Cancelled",  cls: "bg-red-500/15 text-red-400 border border-red-500/30" },
};

// ── TokenCard (grid) ──────────────────────────────────────────────────────────

function TokenCard({ token }: { token: LaunchpadToken }) {
  const badge = STATUS_BADGE[token.status] ?? STATUS_BADGE.pending;
  const isGraduated = token.status === "graduated";
  const isScheduled = token.is_scheduled && !token.is_tradeable;
  const creatorLabel = token.creator_display_name ?? shortAddr(token.creator_wallet, 4, 4);

  return (
    <Link
      href={`/launchpad/${token.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:shadow-[0_0_20px_rgba(16,185,129,0.12)]"
      style={{ borderColor: isGraduated ? "rgba(59,130,246,0.25)" : "rgba(16,185,129,0.18)" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = isGraduated ? "rgba(59,130,246,0.55)" : "rgba(16,185,129,0.50)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = isGraduated ? "rgba(59,130,246,0.25)" : "rgba(16,185,129,0.18)"; }}
    >
      {/* Square image */}
      <div className="relative aspect-square w-full overflow-hidden bg-black">
        {token.logo_url ? (
          <Image
            src={token.logo_url}
            alt={token.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl font-bold tracking-tighter text-white/70">
            {token.ticker.slice(0, 3)}
          </div>
        )}

        {/* Status badge — top-right */}
        <div className="absolute right-2 top-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
            {badge.label}
          </span>
        </div>

        {isScheduled && (
          <div className="absolute left-2 top-2">
            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-400 border border-violet-500/30">
              Soon
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1.5 p-3">

        {/* Row 1: Name + mint address with copy */}
        <div className="flex items-center justify-between gap-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="truncate text-sm font-bold text-foreground group-hover:text-emerald-400 transition-colors">
              {token.name}
            </span>
            {token.is_verified && (
              <BadgeCheck className="size-3.5 shrink-0 text-orange-400" title="Token vérifié" />
            )}
          </div>
          {token.mint_address && (
            <CopyButton text={token.mint_address}>
              {shortAddr(token.mint_address, 4, 4)}
            </CopyButton>
          )}
        </div>

        {/* Row 2: Ticker + stats (holders + mcap) */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">${token.ticker}</span>
          <TokenStats mintAddress={token.mint_address} />
        </div>

        {/* Row 3: By creator name */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[10px] text-muted-foreground">By</span>
          <span className="truncate text-[10px] font-semibold text-foreground">
            {creatorLabel}
          </span>
        </div>

        {/* Row 4: Creator wallet + age */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-muted-foreground/50">
            {shortAddr(token.creator_wallet, 4, 4)}
          </span>
          <span className="text-[10px] font-bold text-muted-foreground/60">
            {timeAgo(token.created_at)}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── TokenRow (list view) ──────────────────────────────────────────────────────

function TokenRow({ token }: { token: LaunchpadToken }) {
  const badge = STATUS_BADGE[token.status] ?? STATUS_BADGE.pending;
  const creatorLabel = token.creator_display_name ?? shortAddr(token.creator_wallet, 4, 4);

  return (
    <Link
      href={`/launchpad/${token.id}`}
      className="group flex items-center gap-3 px-3 py-3 transition-colors"
    >
      {/* Logo */}
      <div className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-black">
        {token.logo_url ? (
          <Image src={token.logo_url} alt={token.name} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/60">
            {token.ticker.slice(0, 3)}
          </div>
        )}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="truncate text-sm font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
            {token.name}
          </span>
          {token.is_verified && (
            <BadgeCheck className="size-3.5 shrink-0 text-orange-400" title="Token vérifié" />
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground">${token.ticker}</span>
          <span className="text-muted-foreground/40 text-[10px]">·</span>
          <span className="text-[10px] text-muted-foreground/60">{token.category}</span>
          {token.mint_address && (
            <CopyButton text={token.mint_address}>
              {shortAddr(token.mint_address, 4, 4)}
            </CopyButton>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[10px] text-muted-foreground/50">By {creatorLabel}</span>
        </div>
      </div>

      {/* Stats (mcap + holders) */}
      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
        <TokenStats mintAddress={token.mint_address} />
      </div>

      {/* Status + time */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-[10px] text-muted-foreground/50">
          {timeAgo(token.created_at)}
        </span>
      </div>
    </Link>
  );
}

// ── LaunchpadClient ───────────────────────────────────────────────────────────

export function LaunchpadClient({ initialTokens }: { initialTokens: LaunchpadToken[] }) {
  const [tab, setTab]           = useState<SortTab>("all");
  const [search, setSearch]     = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Watchlist state
  const { walletAddress }               = useAuth();
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  useEffect(() => {
    if (tab !== "watchlist" || !walletAddress) return;
    setWatchlistLoading(true);
    fetch(`/api/launchpad/watchlist?wallet=${encodeURIComponent(walletAddress)}`)
      .then(r => r.ok ? r.json() : { tokenIds: [] })
      .then((d: { tokenIds: string[] }) => setWatchlistIds(new Set(d.tokenIds)))
      .catch(() => {})
      .finally(() => setWatchlistLoading(false));
  }, [tab, walletAddress]);

  const filtered = useMemo(() => {
    let list = [...initialTokens];

    if (tab === "new") {
      list = list.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    } else if (tab === "graduated") {
      list = list.filter(t => t.status === "graduated");
    } else if (tab === "scheduled") {
      list = list.filter(t => t.is_scheduled && !t.is_tradeable);
    } else if (tab === "watchlist") {
      list = list.filter(t => watchlistIds.has(t.id));
    }

    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter(
        t =>
          t.name.toLowerCase().includes(q) ||
          t.ticker.toLowerCase().includes(q),
      );
    }

    return list;
  }, [initialTokens, tab, search, watchlistIds]);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="border-b border-border pb-3 space-y-2">
        {/* Ligne 1 : Tabs + toggle vue */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {SORT_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === t.id
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Grid / List toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5 shrink-0">
            <button
              onClick={() => setViewMode("grid")}
              className={`rounded p-1.5 transition-colors ${
                viewMode === "grid"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid className="size-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`rounded p-1.5 transition-colors ${
                viewMode === "list"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="List view"
            >
              <List className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Ligne 2 : Search pleine largeur */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="h-8 w-full rounded-lg border border-border bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
        />
      </div>

      {/* Content */}
      {tab === "watchlist" && !walletAddress ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Bell className="mb-3 size-8 text-muted-foreground/40" />
          <p className="mb-1 text-sm font-medium text-foreground">Connect your wallet</p>
          <p className="text-xs text-muted-foreground">Connect to see your watchlisted tokens.</p>
        </div>
      ) : tab === "watchlist" && watchlistLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border bg-card animate-pulse">
              <div className="aspect-square w-full bg-muted/30" />
              <div className="p-2.5 space-y-2">
                <div className="h-3.5 w-24 rounded bg-muted/40" />
                <div className="h-2.5 w-14 rounded bg-muted/30" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          {tab === "watchlist" ? (
            <>
              <Bell className="mb-3 size-8 text-muted-foreground/40" />
              <p className="mb-1 text-sm font-medium text-foreground">No watchlisted tokens</p>
              <p className="text-xs text-muted-foreground">
                Add tokens to your watchlist from their detail page.
              </p>
            </>
          ) : (
            <>
              <p className="mb-3 text-3xl">🚀</p>
              <p className="mb-1 text-sm font-medium text-foreground">No tokens yet</p>
              <p className="mb-5 text-xs text-muted-foreground">
                Be the first to launch a token on OMdotfun
              </p>
              <Link
                href="/launchpad/create"
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Launch a token
              </Link>
            </>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map(token => (
            <TokenCard key={token.id} token={token} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {filtered.map(token => (
            <TokenRow key={token.id} token={token} />
          ))}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {filtered.length} token{filtered.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
