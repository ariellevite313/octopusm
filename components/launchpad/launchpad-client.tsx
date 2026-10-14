"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, List, Copy, Check, BadgeCheck, Bell, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import type { LaunchpadToken, SortOption } from "@/services/launchpad-service";
import { XStockIcon } from "@/components/shared/xstock-icon";
import { useT } from "@/lib/i18n";

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
  const { t } = useT();
  const copy = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success(t.caCopied, {
        description: `${text.slice(0, 8)}…${text.slice(-6)}`,
        duration: 2000,
      });
    });
  }, [text, t]);
  return (
    <button
      onClick={copy}
      className="flex items-center gap-0.5 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
      title="Copier le CA"
    >
      {copied
        ? <Check className="size-3 text-up" />
        : <Copy className="size-3" />
      }
      {children && <span className="text-[10px] font-mono">{children}</span>}
    </button>
  );
}

// ── constants ─────────────────────────────────────────────────────────────────

type TabId   = "all" | "graduated" | "scheduled" | "watchlist";
type ChainId = "all" | "solana" | "arc";

const TABS: { id: TabId; label: string; icon?: React.ReactNode }[] = [
  { id: "all",       label: "All" },
  { id: "graduated", label: "Graduated" },
  { id: "scheduled", label: "Scheduled" },
  { id: "watchlist", label: "Watchlist", icon: <Bell className="size-3" /> },
];

const CHAINS: { id: ChainId; label: string; dot?: string }[] = [
  { id: "all",    label: "All" },
  { id: "solana", label: "SOL", dot: "#14F195" },
  { id: "arc",    label: "ARC", dot: "#6366f1" },
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
  active:     { label: "Live",       cls: "bg-black/55 text-emerald-300 backdrop-blur-md" },
  graduating: { label: "Graduating", cls: "bg-black/55 text-amber-300 backdrop-blur-md" },
  graduated:  { label: "Graduated",  cls: "bg-black/55 text-sky-300 backdrop-blur-md" },
  pending:    { label: "Pending",    cls: "bg-black/55 text-zinc-300 backdrop-blur-md" },
  cancelled:  { label: "Cancelled",  cls: "bg-black/55 text-red-300 backdrop-blur-md" },
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
      href={`/launchpad/${token.mint_address ?? token.id}`}
      className="group relative flex flex-col overflow-hidden rounded-[22px] border bg-card p-2 transition-colors duration-200 hover:bg-muted/60"
      style={{ borderColor: isGraduated ? "color-mix(in oklab, #38bdf8 22%, transparent)" : "var(--border)" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = isGraduated ? "color-mix(in oklab, #38bdf8 45%, transparent)" : "color-mix(in oklab, var(--primary) 40%, transparent)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = isGraduated ? "color-mix(in oklab, #38bdf8 22%, transparent)" : "var(--border)"; }}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-[16px] bg-muted">
        {token.logo_url ? (
          <Image
            src={token.logo_url}
            alt={token.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl font-bold tracking-tighter text-muted-foreground">
            {token.ticker.slice(0, 3)}
          </div>
        )}
        <div className="absolute right-2 top-2">
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        {isScheduled && (
          <div className="absolute left-2 top-2">
            <span className="rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-violet-300 backdrop-blur-md">
              Soon
            </span>
          </div>
        )}
        {/* Stock-paired badge */}
        {token.stock_symbol && !isScheduled && (
          <div className="absolute left-2 top-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-amber-300 backdrop-blur-md">
              <XStockIcon symbol={token.stock_symbol} size={12} />
              ${token.stock_symbol.replace(/^x/, "")}
            </span>
          </div>
        )}
        {/* Chain badge — bottom-left corner */}
        <div className="absolute bottom-2 left-2">
          <Image
            src={token.chain === "arc" ? "/arc-logo.jpeg" : "/solana.png"}
            alt={token.chain === "arc" ? "Arc" : "Solana"}
            width={20} height={20}
            className="rounded-full ring-2 ring-black/40"
            unoptimized
          />
        </div>
      </div>

      <div className="flex flex-col gap-1 px-1.5 pt-2.5 pb-1">
        <div className="flex items-center gap-1 min-w-0">
          <span className="truncate text-[15px] font-bold tracking-tight text-foreground lg:text-sm">
            {token.name}
          </span>
          {token.is_verified && <BadgeCheck className="size-4 shrink-0 fill-primary text-card" />}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-muted-foreground font-medium lg:text-xs">${token.ticker}</span>
          {mcap !== null && (
            <span className="num text-[15px] font-bold text-foreground lg:text-sm">{fmtMcap(mcap)}</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[11px] text-muted-foreground">By</span>
            <span className="truncate text-[11px] font-semibold text-foreground/80">{creatorLabel}</span>
          </div>
          {token.mint_address && (
            <CopyButton text={token.mint_address}>
              {shortAddr(token.mint_address, 4, 4)}
            </CopyButton>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-muted-foreground/60">
            {shortAddr(token.creator_wallet, 4, 4)}
          </span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
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
      href={`/launchpad/${token.mint_address ?? token.id}`}
      className="group flex items-center gap-3.5 rounded-2xl px-2 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-muted">
        {token.logo_url ? (
          <Image src={token.logo_url} alt={token.name} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
            {token.ticker.slice(0, 3)}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="truncate text-base font-bold tracking-tight text-foreground">
            {token.name}
          </span>
          {token.is_verified && <BadgeCheck className="size-4 shrink-0 fill-primary text-card" />}
          {/* Chain icon */}
          <Image
            src={token.chain === "arc" ? "/arc-logo.jpeg" : "/solana.png"}
            alt={token.chain === "arc" ? "Arc" : "Solana"}
            width={14} height={14}
            className="rounded-full shrink-0 ring-1 ring-white/10"
            unoptimized
          />
          {/* Stock-paired badge */}
          {token.stock_symbol && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-500 dark:text-amber-300 shrink-0">
              <XStockIcon symbol={token.stock_symbol} size={11} />
              ${token.stock_symbol.replace(/^x/, "")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] text-muted-foreground">${token.ticker}</span>
          <span className="text-muted-foreground/40 text-[10px]">·</span>
          <span className="text-[12px] text-muted-foreground/70">{token.category}</span>
          {token.mint_address && (
            <CopyButton text={token.mint_address}>
              {shortAddr(token.mint_address, 4, 4)}
            </CopyButton>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[11px] text-muted-foreground/60">By {creatorLabel}</span>
        </div>
      </div>

      <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
        {token.market_cap_usd !== null && (
          <span className="num text-base font-bold text-foreground">{fmtMcap(token.market_cap_usd)}</span>
        )}
        {token.volume_24h_usd !== null && (
          <span className="num text-[12px] text-muted-foreground">
            Vol {fmtMcap(token.volume_24h_usd)}
          </span>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
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
        className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
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
            className={`num flex size-9 items-center justify-center rounded-xl text-sm font-bold transition-colors ${
              p === page
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {(p as number) + 1}
          </button>
        )
      )}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
        className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

// ── Grid skeleton ─────────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: LIMIT }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-[22px] border border-border bg-card p-2 animate-pulse">
          <div className="aspect-square w-full rounded-[16px] bg-muted/60" />
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
  const [chain,    setChain]    = useState<ChainId>("all");
  const [sort,     setSort]     = useState<SortOption>("new");
  const [page,     setPage]     = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search,   setSearch]   = useState("");

  // Data state
  const [tokens,     setTokens]     = useState<LaunchpadToken[]>(initialTokens);
  const [total,      setTotal]      = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(Math.ceil(initialTotal / LIMIT));
  const [loading,    setLoading]    = useState(false);

  // Open wallet connect modal if redirected from /launchpad/create unauthenticated
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("connect") === "1") {
      window.dispatchEvent(new CustomEvent("open-wallet-connect"));
    }
  }, [searchParams]);

  // Watchlist
  const { walletAddress }               = useAuth();
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // Fetch tokens from API
  const fetchTokens = useCallback(async (
    tabVal: TabId,
    sortVal: SortOption,
    pageVal: number,
    searchVal = "",
    chainVal: ChainId = "all",
  ) => {
    if (tabVal === "watchlist") return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tab:   tabVal,
        sort:  sortVal,
        page:  String(pageVal),
        limit: String(LIMIT),
      });
      if (searchVal) params.set("search", searchVal);
      if (chainVal !== "all") params.set("chain", chainVal);
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

  // Watchlist tokens (full data — not just IDs)
  const [watchlistTokens, setWatchlistTokens] = useState<LaunchpadToken[]>([]);

  // Load watchlist
  useEffect(() => {
    if (tab !== "watchlist" || !walletAddress) return;
    setWatchlistLoading(true);
    fetch(`/api/launchpad/watchlist?wallet=${encodeURIComponent(walletAddress)}`)
      .then(r => r.ok ? r.json() : { tokenIds: [], tokens: [] })
      .then((d: { tokenIds: string[]; tokens?: LaunchpadToken[] }) => {
        setWatchlistIds(new Set(d.tokenIds));
        setWatchlistTokens(d.tokens ?? []);
      })
      .catch(() => {})
      .finally(() => setWatchlistLoading(false));
  }, [tab, walletAddress]);

  // Debounced search (400ms) — triggers server-side filtering
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch on tab/sort/page/search change (skip very first mount — use SSR data)
  const isInitialRef = useRef(true);
  const prevSearchRef = useRef("");
  useEffect(() => {
    // Skip initial mount (SSR data already loaded)
    if (isInitialRef.current) {
      isInitialRef.current = false;
      prevSearchRef.current = debouncedSearch;
      return;
    }
    // When search changes, reset to page 0 first; let that trigger the actual fetch
    const searchChanged = prevSearchRef.current !== debouncedSearch;
    prevSearchRef.current = debouncedSearch;
    if (searchChanged && page !== 0) {
      setPage(0);
      return;
    }
    fetchTokens(tab, sort, page, debouncedSearch, chain);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sort, page, debouncedSearch, chain]);

  const handleTabChange = (t: TabId) => {
    setTab(t);
    setPage(0);
  };

  const handleChainChange = (c: ChainId) => {
    setChain(c);
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

  // Watchlist: use dedicated token list; other tabs: use paginated API results
  // Search on watchlist is client-side (no pagination); on other tabs it's server-side via debouncedSearch
  const visibleTokens = (() => {
    if (tab === "watchlist") {
      const q = search.toLowerCase().trim();
      if (!q) return watchlistTokens;
      return watchlistTokens.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.ticker.toLowerCase().includes(q),
      );
    }
    return tokens;
  })();

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="space-y-3">
        {/* Row 1: Tabs + chain filter + view toggle */}
        <div className="flex items-center justify-between gap-2 flex-wrap border-b border-border">
          <div className="-mb-px flex items-center gap-1 overflow-x-auto scrollbar-none">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={`shrink-0 flex items-center gap-1.5 border-b-2 px-3 pb-3 pt-1 text-[15px] font-bold transition-colors ${
                  tab === t.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0 pb-2">
            {/* Chain filter — segmented tabs (Option B) */}
            <div className="flex items-center gap-0.5 rounded-xl bg-muted p-0.5">
              {CHAINS.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => handleChainChange(c.id)}
                  className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-bold transition-colors ${
                    i < CHAINS.length - 1 ? "" : ""
                  } ${
                    chain === c.id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c.id === "arc" ? (
                    <Image src="/arc-logo.jpeg" alt="Arc" width={14} height={14} className="rounded-full shrink-0" unoptimized />
                  ) : c.id === "solana" ? (
                    <Image src="/solana.png" alt="Solana" width={14} height={14} className="rounded-full shrink-0" unoptimized />
                  ) : null}
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 pb-2">
            {/* Grid / List toggle */}
            <div className="flex items-center gap-0.5 rounded-xl bg-muted p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`rounded-[10px] p-1.5 transition-colors ${viewMode === "grid" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="Grid view"
              >
                <LayoutGrid className="size-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`rounded-[10px] p-1.5 transition-colors ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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
            className="h-11 min-w-0 flex-1 rounded-2xl border border-transparent bg-muted px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          {tab !== "watchlist" && (
            <div className="relative shrink-0">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <select
                value={sort}
                onChange={e => handleSortChange(e.target.value as SortOption)}
                className="h-11 w-[140px] appearance-none rounded-2xl border border-transparent bg-muted pl-9 pr-3 text-sm font-semibold sm:w-auto text-foreground focus:outline-none focus:border-primary/50 cursor-pointer"
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
                className="btn-primary rounded-2xl px-6 py-3 text-sm"
              >
                Launch a token
              </Link>
            </>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {visibleTokens.map(token => <TokenCard key={token.id} token={token} />)}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
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
