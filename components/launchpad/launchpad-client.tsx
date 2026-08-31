"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { LayoutGrid, List, Copy, Check, BadgeCheck, Bell, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import type { LaunchpadToken, SortOption } from "@/services/launchpad-service";

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
      {children && <span className="text-[10px] font-mono">{children}</span>}
    </button>
  );
}

// ── constants ─────────────────────────────────────────────────────────────────

type TabId = "all" | "graduated" | "scheduled" | "watchlist";

const TABS: { id: TabId; label: string; icon?: React.ReactNode }[] = [
  { id: "all",       label: "All" },
  { id: "graduated", label: "Graduated" },
  { id: "scheduled", label: "Scheduled" },
  { id: "watchlist", label: "Watchlist", icon: <Bell className="size-3" /> },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "new",            label: "Newest" },
  { value: "old",            label: "Oldest" },
  { value: "verified",       label: "Verified only" },
  { value: "market_cap_desc", label: "Market cap ↓" },
  { value: "market_cap_asc",  label: "Market cap ↑" },
  { value: "volume",         label: "Volume 24h" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:     { label: "Live",       cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" },
  graduating: { label: "Graduating", cls: "bg-amber-500/15 text-amber-400 border border-amber-500/30" },
  graduated:  { label: "Graduated",  cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
  pending:    { label: "Pending",    cls: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30" },
  cancelled:  { label: "Cancelled",  cls: "bg-red-500/15 text-red-400 border border-red-500/30" },
};

const LIMIT = 20;

// ── TokenCard ─────────────────────────────────────────────────────────────────

function TokenCard({ token }: { token: LaunchpadToken }) {
  const badge = STATUS_BADGE[token.status] ?? STATUS_BADGE.pending;
  const isGraduated = token.status === "graduated";
  const isScheduled = token.is_scheduled && !token.is_tradeable;
  const creatorLabel = token.creator_display_name ?? shortAddr(token.creator_wallet, 4, 4);
  const mcap = token.market_cap_usd;

  return (
    <Link
      href={`/launchpad/${token.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:shadow-[0_0_20px_rgba(16,185,129,0.12)]"
      style={{ borderColor: isGraduated ? "rgba(59,130,246,0.25)" : "rgba(16,185,129,0.18)" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = isGraduated ? "rgba(59,130,246,0.55)" : "rgba(16,185,129,0.50)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = isGraduated ? "rgba(59,130,246,0.25)" : "rgba(16,185,129,0.18)"; }}
    >
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
        {token.is_verified && (
          <div className="absolute left-2 bottom-2">
            <span className="flex items-center gap-0.5 rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold text-orange-400 border border-orange-500/30">
              <BadgeCheck className="size-2.5" /> Verified
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between gap-1 min-w-0">
          <span className="truncate text-sm font-bold text-foreground group-hover:text-emerald-400 transition-colors">
            {token.name}
          </span>
          {token.mint_address && (
            <CopyButton text={token.mint_address}>
              {shortAddr(token.mint_address, 4, 4)}
            </CopyButton>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">${token.ticker}</span>
          {mcap !== null && (
            <span className="text-xs font-bold text-emerald-400">{fmtMcap(mcap)}</span>
          )}
        </div>

        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[10px] text-muted-foreground">By</span>
          <span className="truncate text-[10px] font-semibold text-foreground">{creatorLabel}</span>
        </div>

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

// ── TokenRow ──────────────────────────────────────────────────────────────────

function TokenRow({ token }: { token: LaunchpadToken }) {
  const badge = STATUS_BADGE[token.status] ?? STATUS_BADGE.pending;
  const creatorLabel = token.creator_display_name ?? shortAddr(token.creator_wallet, 4, 4);

  return (
    <Link
      href={`/launchpad/${token.id}`}
      className="group flex items-center gap-3 px-3 py-3 transition-colors"
    >
      <div className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-black">
        {token.logo_url ? (
          <Image src={token.logo_url} alt={token.name} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/60">
            {token.ticker.slice(0, 3)}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="truncate text-sm font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
            {token.name}
          </span>
          {token.is_verified && <BadgeCheck className="size-3.5 shrink-0 text-orange-400" />}
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

      <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
        {token.market_cap_usd !== null && (
          <span className="text-xs font-bold text-emerald-400">{fmtMcap(token.market_cap_usd)}</span>
        )}
        {token.volume_24h_usd !== null && (
          <span className="text-[10px] text-muted-foreground/60">
            Vol {fmtMcap(token.volume_24h_usd)}
          </span>
        )}
      </div>

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

// ── Pagination ─────────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Show up to 7 page buttons around current page
  const pages: (number | "…")[] = [];
  const delta = 2;
  for (let i = 0; i < totalPages; i++) {
    if (
      i === 0 ||
      i === totalPages - 1 ||
      (i >= page - delta && i <= page + delta)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 pt-4 pb-2">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <ChevronLeft className="size-4" />
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p as number)}
            className={`flex size-8 items-center justify-center rounded-lg text-xs font-semibold transition-colors border ${
              p === page
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {(p as number) + 1}
          </button>
        )
      )}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
        className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

// ── Grid skeleton ─────────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: LIMIT }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card animate-pulse">
          <div className="aspect-square w-full bg-muted/30" />
          <div className="p-3 space-y-2">
            <div className="h-3.5 w-24 rounded bg-muted/40" />
            <div className="h-2.5 w-14 rounded bg-muted/30" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── LaunchpadClient ───────────────────────────────────────────────────────────

type ApiResponse = {
  tokens: LaunchpadToken[];
  total: number;
  page: number;
  totalPages: number;
};

export function LaunchpadClient({ initialTokens, initialTotal }: {
  initialTokens: LaunchpadToken[];
  initialTotal: number;
}) {
  const [tab,      setTab]      = useState<TabId>("all");
  const [sort,     setSort]     = useState<SortOption>("new");
  const [page,     setPage]     = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search,   setSearch]   = useState("");

  // Data state
  const [tokens,     setTokens]     = useState<LaunchpadToken[]>(initialTokens);
  const [total,      setTotal]      = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(Math.ceil(initialTotal / LIMIT));
  const [loading,    setLoading]    = useState(false);

  // Watchlist
  const { walletAddress }               = useAuth();
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // Fetch tokens from API
  const fetchTokens = useCallback(async (
    tabVal: TabId,
    sortVal: SortOption,
    pageVal: number,
  ) => {
    if (tabVal === "watchlist") return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tab:  tabVal,
        sort: sortVal,
        page: String(pageVal),
        limit: String(LIMIT),
      });
      const res = await fetch(`/api/launchpad/tokens?${params}`);
      if (!res.ok) return;
      const data: ApiResponse = await res.json();
      setTokens(data.tokens);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch { /* keep previous state */ } finally {
      setLoading(false);
    }
  }, []);

  // Load watchlist
  useEffect(() => {
    if (tab !== "watchlist" || !walletAddress) return;
    setWatchlistLoading(true);
    fetch(`/api/launchpad/watchlist?wallet=${encodeURIComponent(walletAddress)}`)
      .then(r => r.ok ? r.json() : { tokenIds: [] })
      .then((d: { tokenIds: string[] }) => setWatchlistIds(new Set(d.tokenIds)))
      .catch(() => {})
      .finally(() => setWatchlistLoading(false));
  }, [tab, walletAddress]);

  // Fetch on tab/sort/page change (skip initial render — use SSR data)
  const isInitial = useState(true)[0];
  useEffect(() => {
    // Skip very first render (SSR data already loaded)
    if (isInitial && tab === "all" && sort === "new" && page === 0) return;
    fetchTokens(tab, sort, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sort, page]);

  const handleTabChange = (t: TabId) => {
    setTab(t);
    setPage(0);
  };

  const handleSortChange = (s: SortOption) => {
    setSort(s);
    setPage(0);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Filter watchlist + search client-side
  const visibleTokens = (() => {
    let list = tab === "watchlist"
      ? tokens.filter(t => watchlistIds.has(t.id))
      : tokens;
    const q = search.toLowerCase().trim();
    if (q) list = list.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.ticker.toLowerCase().includes(q),
    );
    return list;
  })();

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="border-b border-border pb-3 space-y-2">
        {/* Row 1: Tabs + view toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
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

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Grid / List toggle */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`rounded p-1.5 transition-colors ${viewMode === "grid" ? "bg-emerald-500/10 text-emerald-400" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="Grid view"
              >
                <LayoutGrid className="size-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`rounded p-1.5 transition-colors ${viewMode === "list" ? "bg-emerald-500/10 text-emerald-400" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="List view"
              >
                <List className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Search + Sort */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 flex-1 rounded-lg border border-border bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />
          {tab !== "watchlist" && (
            <div className="relative shrink-0">
              <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <select
                value={sort}
                onChange={e => handleSortChange(e.target.value as SortOption)}
                className="h-8 appearance-none rounded-lg border border-border bg-background pl-7 pr-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {tab === "watchlist" && !walletAddress ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Bell className="mb-3 size-8 text-muted-foreground/40" />
          <p className="mb-1 text-sm font-medium text-foreground">Connect your wallet</p>
          <p className="text-xs text-muted-foreground">Connect to see your watchlisted tokens.</p>
        </div>
      ) : tab === "watchlist" && watchlistLoading ? (
        <GridSkeleton />
      ) : loading ? (
        <GridSkeleton />
      ) : visibleTokens.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          {tab === "watchlist" ? (
            <>
              <Bell className="mb-3 size-8 text-muted-foreground/40" />
              <p className="mb-1 text-sm font-medium text-foreground">No watchlisted tokens</p>
              <p className="text-xs text-muted-foreground">Add tokens to your watchlist from their detail page.</p>
            </>
          ) : (
            <>
              <p className="mb-3 text-3xl">🚀</p>
              <p className="mb-1 text-sm font-medium text-foreground">No tokens yet</p>
              <p className="mb-5 text-xs text-muted-foreground">Be the first to launch a token on OMdotfun</p>
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
          {visibleTokens.map(token => <TokenCard key={token.id} token={token} />)}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {visibleTokens.map(token => <TokenRow key={token.id} token={token} />)}
        </div>
      )}

      {/* Pagination (not for watchlist) */}
      {tab !== "watchlist" && !loading && (
        <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
      )}

      <p className="text-center text-xs text-muted-foreground">
        {tab !== "watchlist" ? `${total} token${total !== 1 ? "s" : ""}` : `${visibleTokens.length} token${visibleTokens.length !== 1 ? "s" : ""}`}
      </p>
    </div>
  );
}
