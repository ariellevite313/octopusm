"use client";

/**
 * Terminal OM (Solana) : solde, meilleurs traders, Favoris / Tokens / Perps, filtres, liste ;
 * page d'un token avec graphique en ligne, Détenteurs / Fil / À propos et barre d'achat.
 * Frais OM 0,3 % (0 % sur les tokens OM), toujours signé par le portefeuille de l'utilisateur.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, AlertTriangle, BadgeCheck, CandlestickChart, Check, ChevronLeft, Copy, ExternalLink, Loader2, Search, SlidersHorizontal, Share2, Star, Trophy, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { SwapBox } from "@/components/swap/swap-box";
import { EvmSwapBox } from "@/components/swap/evm-swap-box";
import { EVM_CHAINS, isEvmChain } from "@/lib/swap/evm";
import { PostCard } from "@/components/social/post-card";
import type { FeedPost } from "@/lib/social/posts";
import { CHAINS, GT_NET, type TerminalChain, type TerminalToken } from "@/lib/terminal";
import { SOL_MINT } from "@/lib/swap/core";
import { executeSwap, toRaw } from "@/lib/swap/client";
import { TerminalLineChart, T_RANGES, type ChartMode, type TRange } from "./line-chart";

// ── Formats ───────────────────────────────────────────────────────────────────
const compact = (n: number | null, d = 1) => n == null ? "-" : n >= 1e9 ? `$${(n / 1e9).toFixed(d)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(d)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(d)}K` : `$${n.toFixed(2)}`;
function price(n: number | null): string {
  if (n == null) return "-";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  if (n >= 0.0001) return `$${n.toFixed(6).replace(/0+$/, "")}`;
  return `$${n.toPrecision(3)}`;
}
const pct = (n: number) => `${Math.abs(n) >= 1000 ? Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 }) : Math.abs(n).toFixed(2)}%`;
const isMintLike = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

// ── Favoris (préférence de ce navigateur) ─────────────────────────────────────
const FAV_KEY = "om_terminal_favs";
function readFavs(): TerminalToken[] {
  try { const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]"); return Array.isArray(v) ? v.slice(0, 100) : []; } catch { return []; }
}
function writeFavs(list: TerminalToken[]) { try { localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, 100))); } catch { /* stockage indisponible */ } }
function useFavs() {
  const [favs, setFavs] = useState<TerminalToken[]>([]);
  useEffect(() => { setFavs(readFavs()); }, []);
  const toggle = useCallback((t: TerminalToken) => {
    setFavs((cur) => { const next = cur.some((x) => x.mint === t.mint) ? cur.filter((x) => x.mint !== t.mint) : [t, ...cur]; writeFavs(next); return next; });
  }, []);
  return { favs, isFav: (m: string) => favs.some((x) => x.mint === m), toggle };
}

// ── Petits éléments ───────────────────────────────────────────────────────────
function Logo({ src, sym, size = "size-12" }: { src: string | null; sym: string; size?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" loading="lazy" className={`${size} shrink-0 rounded-full bg-muted object-cover`} />
    : <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-muted text-base font-bold text-foreground`}>{sym.slice(0, 1)}</span>;
}
function Tick({ className = "size-[18px]" }: { className?: string }) {
  return <BadgeCheck className={`${className} shrink-0 fill-[#4f6bff] text-white`} aria-label="Verified" />;
}
function Change({ v, className = "" }: { v: number | null; className?: string }) {
  if (v == null) return null;
  const up = v >= 0;
  return <span className={`num inline-flex items-center gap-0.5 font-semibold ${up ? "text-up" : "text-down"} ${className}`}><span className="text-[0.7em]">{up ? "▲" : "▼"}</span>{pct(v)}</span>;
}
function Sheet({ onClose, children, title }: { onClose: () => void; children: React.ReactNode; title?: string }) {
  const { tr } = useT();
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border-t border-border bg-background px-4 pb-8 pt-2 md:rounded-[28px] md:border">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[17px] font-bold">{title}</span>
          <button onClick={onClose} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function Terminal() {
  const sp = useSearchParams();
  const mint = sp.get("mint") ?? "";
  const cParam = sp.get("chain") ?? "solana";
  const chain: TerminalChain = CHAINS.some((c) => c.id === cParam && c.ready) ? (cParam as TerminalChain) : "solana";
  const favs = useFavs();
  const [list, setList] = useState<TerminalToken[] | null>(null);
  // Ordinateur : sans token choisi, on montre un token Solana pris au hasard parmi les premiers de la liste
  const [dflt, setDflt] = useState<TerminalToken | null>(null);
  useEffect(() => {
    if (mint || dflt || !list?.length) return;
    const pool = list.filter((t) => (t.chain ?? "solana") === "solana" && !t.href && t.pool).slice(0, 10);
    if (pool.length) setDflt(pool[Math.floor(Math.random() * pool.length)]);
  }, [mint, list, dflt]);
  return (
    <div className="mx-auto max-w-[1400px] pb-28 md:pb-10 lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-6 lg:px-4 lg:pt-4">
      <div className={`${mint ? "hidden lg:block" : ""} lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:overflow-y-auto lg:[scrollbar-width:none]`}>
        <Home key={sp.get("chains") ?? "all"} selected={(sp.get("chains") ?? "").split(",").filter((c) => CHAINS.some((x) => x.id === c && x.ready)) as TerminalChain[]} favs={favs} active={mint} onList={setList} initialQ={sp.get("q") ?? ""} />
      </div>
      {mint ? <TokenView key={mint} mint={mint} chain={chain} fromList={list?.find((t) => t.mint === mint) ?? favs.favs.find((t) => t.mint === mint) ?? null} favs={favs} />
        : dflt ? <div className="hidden lg:block"><TokenView key={dflt.mint} mint={dflt.mint} chain="solana" fromList={dflt} favs={favs} /></div>
        : <div className="hidden items-center justify-center text-muted-foreground lg:flex"><EmptyPick /></div>}
    </div>
  );
}

function EmptyPick() {
  const { tr } = useT();
  return <p className="text-sm">{tr("Pick a token to see its chart")}</p>;
}

// ── Accueil ───────────────────────────────────────────────────────────────────
function Home({ selected, favs, active, onList, initialQ }: { selected: TerminalChain[]; favs: ReturnType<typeof useFavs>; active: string; onList: (l: TerminalToken[]) => void; initialQ: string }) {
  const { tr } = useT();
  const router = useRouter();
  const [tab, setTab] = useState<"favs" | "tokens">("tokens");
  const [filter, setFilter] = useState<"trending" | "new" | "volume">("trending");
  const [q, setQ] = useState(initialQ);
  const [searching, setSearching] = useState(!!initialQ);
  const [list, setList] = useState<TerminalToken[] | null>(null);
  const [err, setErr] = useState(false);
  const [netSheet, setNetSheet] = useState(false);
  const chainsQ = selected.length ? selected.join(",") : "all";

  useEffect(() => {
    if (tab !== "tokens") return;
    let live = true;
    setList(null); setErr(false);
    const query = q.trim().replace(/^\$/, "");
    const t = setTimeout(async () => {
      try {
        const r = await fetch(query.length >= 2 ? `/api/terminal?chains=${chainsQ}&q=${encodeURIComponent(query)}` : `/api/terminal?chains=${chainsQ}&list=${filter}`);
        const j = await r.json();
        if (live) { setList(j.tokens ?? []); setErr(!r.ok); onList(j.tokens ?? []); }
      } catch { if (live) { setList([]); setErr(true); } }
    }, query ? 350 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [tab, filter, q, onList, chainsQ]);

  const open = (m: string, t?: TerminalToken) => {
    if (t?.href) { router.push(t.href); return; }
    const c = t?.chain ?? "solana";
    router.push(`/terminal?${c !== "solana" ? `chain=${c}&` : ""}mint=${m}`, { scroll: true });
  };
  const rows = tab === "favs" ? favs.favs : list;

  return (
    <div className="px-4 pt-3 lg:px-0 lg:pt-0">
      <BalanceCard />
      <TopTraders />

      {/* Favoris | Tokens | Perps */}
      <div className="sticky top-16 z-20 -mx-4 mt-4 border-b border-border bg-background px-4 lg:top-0 lg:mx-0 lg:px-0">
        <div className="flex">
          <button onClick={() => setTab("favs")} className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-[16px] font-bold ${tab === "favs" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}>
            <Star className="size-4" />{tr("Favorites")}
          </button>
          <button onClick={() => setTab("tokens")} className={`flex-1 border-b-2 py-3 text-[16px] font-bold ${tab === "tokens" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}>{tr("Tokens")}</button>
          <span className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 border-b-2 border-transparent py-3 text-[16px] font-bold text-muted-foreground/50">
            {tr("Perps")}<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{tr("Soon")}</span>
          </span>
        </div>
      </div>

      {tab === "tokens" && (
        searching ? (
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search a token or paste a mint")}
              className="h-11 w-full rounded-2xl bg-muted pl-9 pr-10 text-[15px] outline-none placeholder:text-muted-foreground" />
            <button onClick={() => { setQ(""); setSearching(false); }} aria-label={tr("Close")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="size-4" /></button>
          </div>
        ) : (
          <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            <button onClick={() => setSearching(true)} aria-label={tr("Search")} className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground"><Search className="size-[18px]" /></button>
            {([["trending", tr("Trending")], ["new", tr("New")], ["volume", tr("Top volume")]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={`h-10 shrink-0 rounded-xl px-4 text-[15px] font-semibold ${filter === k ? "bg-muted text-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}>{label}</button>
            ))}
            <button onClick={() => setNetSheet(true)} aria-label={tr("Filter by network")}
              className={`relative flex size-10 shrink-0 items-center justify-center rounded-xl ${selected.length ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:text-foreground"}`}>
              <SlidersHorizontal className="size-[18px]" />
            </button>
          </div>
        )
      )}

      {tab === "tokens" && q.trim() && isMintLike(q.trim()) && (
        <button onClick={() => open(q.trim())} className="mt-3 w-full rounded-2xl bg-muted/60 px-4 py-3 text-left text-sm font-semibold hover:bg-muted">{tr("Open this mint")} <span className="font-mono text-muted-foreground">{short(q.trim())}</span></button>
      )}

      <div className="mt-1">
        {rows === null ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="my-2 h-14 animate-pulse rounded-2xl bg-muted/40" />)
          : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {tab === "favs" ? tr("No token in your watchlist yet") : err ? tr("Market data unavailable") : tr("No token found")}
            </p>
          ) : rows.map((t) => (
            <button key={`${t.chain ?? "solana"}:${t.mint}`} onClick={() => open(t.mint, t)}
              className={`flex w-full items-center gap-3 rounded-2xl px-1 py-3 text-left transition-colors ${t.mint === active ? "bg-muted" : "hover:bg-muted/40"}`}>
              <span className="relative shrink-0">
                <Logo src={t.logo} sym={t.symbol} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {selected.length !== 1 && <img src={`/chains/${t.chain ?? "solana"}.png`} alt="" className="absolute -bottom-0.5 -right-0.5 size-[18px] rounded-full ring-2 ring-background" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[17px] font-bold text-foreground"><span className="truncate">{t.symbol}</span>{t.verified && <Tick />}</p>
                <p className="num truncate text-[14px] text-muted-foreground">{compact(t.mcap)} {tr("cap.")}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="num text-[17px] font-bold text-foreground">{price(t.price)}</p>
                <Change v={t.change24h} className="text-[13px]" />
              </div>
            </button>
          ))}
      </div>
      {netSheet && <NetworkSheet selected={selected} onClose={() => setNetSheet(false)} />}
    </div>
  );
}

/** « Filtrer par réseau » : tous les réseaux, ou une sélection (Elysium et Robinhood bientôt). */
function NetworkSheet({ selected, onClose }: { selected: TerminalChain[]; onClose: () => void }) {
  const { tr } = useT();
  const router = useRouter();
  const [pick, setPick] = useState<TerminalChain[]>(selected);
  const toggle = (c: TerminalChain) => setPick((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const save = () => {
    const ready = CHAINS.filter((c) => c.ready).map((c) => c.id);
    const all = pick.length === 0 || ready.every((c) => pick.includes(c));
    router.push(all ? "/terminal" : `/terminal?chains=${pick.join(",")}`);
    onClose();
  };
  const Row = ({ icon, label, on, onClick, soon }: { icon: string; label: string; on: boolean; onClick?: () => void; soon?: boolean }) => (
    <button onClick={onClick} disabled={soon} className="flex w-full items-center gap-4 rounded-3xl bg-card px-5 py-4 text-left disabled:cursor-not-allowed">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" className={`size-9 rounded-[10px] ${soon ? "opacity-40" : ""}`} />
      <span className={`flex-1 text-[19px] font-semibold ${soon ? "text-muted-foreground/60" : "text-foreground"}`}>{label}</span>
      {soon ? <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{tr("Soon")}</span>
        : <span className={`flex size-7 items-center justify-center rounded-md ${on ? "bg-foreground text-background" : "border-2 border-muted-foreground/50"}`}>{on && <Check className="size-4" strokeWidth={3} />}</span>}
    </button>
  );
  return (
    <Sheet title={tr("Filter by network")} onClose={onClose}>
      <div className="space-y-3">
        <Row icon="/chains/mono/all.png" label={tr("All networks")} on={pick.length === 0} onClick={() => setPick([])} />
        {CHAINS.map((c) => <Row key={c.id} icon={`/chains/mono/${c.id}.png`} label={c.name === "BNB" ? "BNB Chain" : c.name === "Robinhood" ? "Robinhood Chain" : c.name} on={pick.includes(c.id)} onClick={() => toggle(c.id)} soon={!c.ready} />)}
      </div>
      <button onClick={save} className="mt-5 h-14 w-full rounded-3xl bg-foreground text-[17px] font-bold text-background">{tr("Save")}</button>
    </Sheet>
  );
}

function BalanceCard() {
  const { tr } = useT();
  const { walletAddress, isAuthenticated } = useAuth();
  const sol = isAuthenticated && !!walletAddress && !walletAddress.startsWith("0x");
  const [total, setTotal] = useState<number | null>(null);
  const [dep, setDep] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!sol) { setTotal(null); return; }
    fetch("/api/bags").then((r) => (r.ok ? r.json() : null)).then((j) => setTotal(j?.total ?? null)).catch(() => {});
  }, [sol, walletAddress]);
  const [i, d] = (total ?? 0).toFixed(2).split(".");
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <Link href="/dashboard/launchpad" className="min-w-0">
        <p className="num text-[40px] font-bold leading-none tracking-tight text-foreground">${Number(i).toLocaleString("en-US")}<span className="text-muted-foreground">.{d}</span></p>
        <p className="mt-1.5 text-[14px] text-muted-foreground">{sol ? tr("Your bags") : tr("Connect to see your bags")}</p>
      </Link>
      <button onClick={() => (sol ? setDep(true) : window.dispatchEvent(new CustomEvent("open-wallet-connect")))}
        className="h-12 shrink-0 rounded-2xl bg-foreground px-6 text-[16px] font-bold text-background">{sol ? tr("Deposit") : tr("Connect")}</button>
      {dep && walletAddress && (
        <Sheet title={tr("Deposit")} onClose={() => setDep(false)}>
          <p className="text-sm text-muted-foreground">{tr("Send SOL or USDC on Solana to your wallet address:")}</p>
          <div className="mt-3 break-all rounded-2xl bg-muted p-4 font-mono text-[14px] text-foreground">{walletAddress}</div>
          <button onClick={() => navigator.clipboard.writeText(walletAddress).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground font-bold text-background">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? tr("Copied") : tr("Copy address")}
          </button>
          <p className="mt-3 text-xs text-muted-foreground">{tr("Only send tokens on the Solana network. Funds sent from another network can be lost.")}</p>
        </Sheet>
      )}
    </div>
  );
}

type Trader = { wallet: string; usd: number; name: string | null; avatar: string | null };
function TopTraders() {
  const { tr } = useT();
  const [rows, setRows] = useState<Trader[]>([]);
  useEffect(() => { fetch("/api/terminal/top-traders").then((r) => r.json()).then((j) => setRows(j.traders ?? [])).catch(() => {}); }, []);
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-2 flex items-center justify-end gap-1.5 text-[14px] font-semibold text-muted-foreground"><Trophy className="size-4" />{tr("Top traders")}</p>
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
        {rows.map((t) => (
          <Link key={t.wallet} href={`/profile/${t.wallet}`} className="w-40 shrink-0 rounded-2xl bg-muted/50 p-3">
            <p className="flex items-center gap-2 truncate text-[14px] font-semibold text-foreground">
              {t.avatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={t.avatar} alt="" className="size-5 rounded-full object-cover" />
                : <span className="size-5 rounded-full bg-muted" />}
              <span className="truncate">{t.name ?? short(t.wallet)}</span>
            </p>
            <p className="num mt-2 text-[18px] font-bold text-up">+${t.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-[11px] text-muted-foreground">{tr("earned on OM")}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Page d'un token ───────────────────────────────────────────────────────────
type SwapToken = { verified: boolean | null; om_id: string | null; fee_bps: number };

function TokenView({ mint, chain, fromList, favs }: { mint: string; chain: TerminalChain; fromList: TerminalToken | null; favs: ReturnType<typeof useFavs> }) {
  const isSol = chain === "solana";
  const { tr } = useT();
  const router = useRouter();
  const { walletAddress, walletType, isAuthenticated } = useAuth();
  const [t, setT] = useState<TerminalToken | null>(fromList);
  const [info, setInfo] = useState<SwapToken | null>(null);
  const [range, setRange] = useState<TRange>("1D");
  // Ligne par défaut ; le choix de l'utilisateur (ligne ou chandeliers) est retenu
  const [mode, setMode] = useState<ChartMode>("line");
  useEffect(() => { try { if (localStorage.getItem("om_chart_mode") === "candle") setMode("candle"); } catch { /* ignore */ } }, []);
  const toggleMode = () => setMode((m) => { const n = m === "line" ? "candle" : "line"; try { localStorage.setItem("om_chart_mode", n); } catch { /* ignore */ } return n; });
  const [move, setMove] = useState<{ first: number; last: number } | null>(null);
  const [tab, setTab] = useState<"holders" | "feed" | "about">("holders");
  const [sheet, setSheet] = useState<"swap" | "quick" | null>(null);
  const [copied, setCopied] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (fromList) return;
    fetch(`/api/terminal?chain=${chain}&q=${mint}`).then((r) => r.json()).then((j) => {
      const found = (j.tokens ?? []).find((x: TerminalToken) => x.mint.toLowerCase() === mint.toLowerCase());
      setT(found ?? { mint, symbol: short(mint), name: short(mint), logo: null, price: null, change24h: null, volume24h: null, mcap: null, liquidity: null, pool: "", createdAt: null });
    }).catch(() => {});
  }, [mint, fromList]);
  useEffect(() => { if (isSol) fetch(`/api/swap/token?mint=${mint}`).then((r) => (r.ok ? r.json() : null)).then((j) => j?.token && setInfo(j.token)).catch(() => {}); }, [mint, isSol]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 170);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const onChart = useCallback((first: number, last: number) => setMove({ first, last }), []);

  if (!t) return <div className="m-4 h-[70vh] animate-pulse rounded-3xl bg-muted/30" />;

  const live = move?.last ?? t.price;
  const diff = move ? move.last - move.first : null;
  const diffPct = move && move.first > 0 ? ((move.last - move.first) / move.first) * 100 : null;
  const rangeLabel = range === "LIVE" ? "30m" : range === "ALL" ? tr("all") : range.toLowerCase();
  const fav = favs.isFav(mint);
  const share = () => {
    const url = `${location.origin}/terminal?${isSol ? "" : `chain=${chain}&`}mint=${mint}`;
    if (navigator.share) navigator.share({ title: `$${t.symbol} on OM`, url }).catch(() => {});
    else navigator.clipboard.writeText(url).then(() => toast.success(tr("Link copied")));
  };

  return (
    <div className="min-w-0 pb-40 lg:pb-8">
      {/* En-tête */}
      <div className="sticky top-16 z-20 flex items-center gap-2 bg-background/95 px-3 py-2 backdrop-blur lg:top-0">
        <button onClick={() => router.push("/terminal")} aria-label={tr("Back")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground lg:hidden"><ChevronLeft className="size-6" /></button>
        <Logo src={t.logo} sym={t.symbol} size="size-11" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[18px] font-bold text-foreground"><span className="truncate">{t.symbol}</span>{(t.verified || info?.verified) && <Tick className="size-5" />}</p>
          <button onClick={() => navigator.clipboard.writeText(mint).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
            className="flex max-w-full items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
            <span className="truncate">{t.name}</span>{copied ? <Check className="size-3 shrink-0" /> : <Copy className="size-3 shrink-0" />}
          </button>
        </div>
        {scrolled ? (
          <div className="shrink-0 text-right">
            <p className="num text-[16px] font-bold text-foreground">{price(live)}</p>
            {diffPct != null && <Change v={diffPct} className="text-xs" />}
          </div>
        ) : (
          <div className="flex shrink-0 items-center">
            <button onClick={() => favs.toggle(t)} aria-label={tr("Favorites")} className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
              <Star className={`size-[22px] ${fav ? "fill-foreground text-foreground" : ""}`} />
            </button>
            <button onClick={share} aria-label={tr("Share")} className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"><Share2 className="size-[21px]" /></button>
          </div>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="min-w-0">
          {/* Prix */}
          <div className="flex items-start justify-between gap-3 px-4 pt-3">
            <div className="min-w-0">
              <p className="num text-[36px] font-bold leading-none tracking-tight text-foreground">{price(live)}</p>
              {diff != null && diffPct != null && (
                <p className={`num mt-2 text-[14px] font-semibold ${diff >= 0 ? "text-up" : "text-down"}`}>
                  {diff >= 0 ? "▲" : "▼"} {price(Math.abs(diff))} ({pct(diffPct)}) <span className="font-normal text-muted-foreground">{rangeLabel}</span>
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="num text-[18px] font-bold text-foreground">{compact(t.mcap)}</p>
              <p className="text-[14px] text-muted-foreground">{tr("Market cap")}</p>
            </div>
          </div>

          {/* Graphique */}
          <div className="mt-4">{t.pool ? <TerminalLineChart pool={t.pool} range={range} mode={mode} onChange={onChart} network={GT_NET[chain] ?? "solana"} /> : <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">{tr("Chart unavailable")}</div>}</div>
          <div className="flex items-center justify-center gap-1 px-4 py-2">
            {T_RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${range === r ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {r === "LIVE" ? <span className="flex items-center gap-1">LIVE<span className="size-1.5 rounded-full bg-up" /></span> : r}
              </button>
            ))}
            {t.pool && (
              <button onClick={toggleMode} aria-label={mode === "line" ? tr("Candlestick chart") : tr("Line chart")} className="ml-1 rounded-lg px-2.5 py-1.5 text-muted-foreground hover:text-foreground">
                {mode === "line" ? <CandlestickChart className="size-[18px]" /> : <Activity className="size-[18px]" />}
              </button>
            )}
          </div>

          {/* Détenteurs | Fil | À propos */}
          <div className="mt-2 flex border-b border-border px-4">
            {([["holders", tr("Holders")], ["feed", tr("Feed")], ["about", tr("About")]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex-1 border-b-2 py-3 text-[15px] font-bold ${tab === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
          <div className="px-4 pt-3">
            {tab === "holders" && (isSol ? <Holders mint={mint} price={live} /> : <p className="py-8 text-center text-sm text-muted-foreground">{tr("Holders unavailable right now.")}</p>)}
            {tab === "feed" && <TokenFeed symbol={t.symbol} />}
            {tab === "about" && <About t={t} info={info} />}
          </div>
        </div>

        {/* Ordinateur : boîte de swap à droite */}
        <aside className="hidden lg:block">
          <div className="sticky top-16 space-y-3">
            {isSol ? <><SwapBox mint={mint} /><Verified info={info} /></> : isEvmChain(chain) ? <EvmSwapBox chain={chain} token={mint} /> : <SoonTrade chain={chain} />}
          </div>
        </aside>
      </div>

      {/* Téléphone : barre d'achat */}
      {!isSol ? <div className="fixed inset-x-0 bottom-[88px] z-30 border-t border-border bg-background px-4 pb-2 pt-2.5 lg:hidden">
        {isEvmChain(chain) ? <button onClick={() => setSheet("swap")} className="h-14 w-full rounded-2xl bg-foreground text-[17px] font-bold text-background">{tr("Buy")} / {tr("Sell")}</button> : <SoonTrade chain={chain} />}
      </div> : (
      <div className="fixed inset-x-0 bottom-[88px] z-30 border-t border-border bg-background px-4 pb-2 pt-2.5 lg:hidden">
        <Verified info={info} />
        <div className="mt-2 flex gap-2">
          <button onClick={() => setSheet("swap")} className="h-14 flex-1 rounded-2xl bg-foreground text-[17px] font-bold text-background">{tr("Buy")} / {tr("Sell")}</button>
          <button onClick={() => (isAuthenticated && walletAddress && !walletAddress.startsWith("0x") ? setSheet("quick") : window.dispatchEvent(new CustomEvent("open-wallet-connect")))}
            aria-label={tr("Quick buy")} className="flex size-14 items-center justify-center rounded-2xl bg-muted text-foreground"><Zap className="size-6 fill-current" /></button>
        </div>
      </div>)}

      {sheet === "swap" && <Sheet title={`$${t.symbol}`} onClose={() => setSheet(null)}>{isEvmChain(chain) ? <EvmSwapBox chain={chain} token={mint} /> : <SwapBox mint={mint} onSwapped={() => setSheet(null)} />}</Sheet>}
      {sheet === "quick" && walletType && <Sheet title={tr("Quick buy")} onClose={() => setSheet(null)}><QuickBuy mint={mint} symbol={t.symbol} feeBps={info?.fee_bps ?? 30} walletType={walletType} onDone={() => setSheet(null)} /></Sheet>}
    </div>
  );
}

function SoonTrade({ chain }: { chain: TerminalChain }) {
  const { tr } = useT();
  const name = CHAINS.find((c) => c.id === chain)?.name ?? chain;
  return (
    <button disabled className="h-14 w-full cursor-not-allowed rounded-2xl bg-muted text-[15px] font-bold text-muted-foreground">
      {tr("Trading on {chain} is coming soon", { chain: name })}
    </button>
  );
}

function Verified({ info }: { info: SwapToken | null }) {
  const { tr } = useT();
  if (!info) return null;
  return info.verified
    ? <p className="flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground"><BadgeCheck className="size-4 text-up" />{info.om_id ? tr("Launched on OM") : tr("Verified token")}</p>
    : <p className="flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground"><AlertTriangle className="size-4" />{tr("Unverified token, trade carefully")}</p>;
}

const QUICK = ["0.1", "0.25", "0.5", "1"];
function QuickBuy({ mint, symbol, feeBps, walletType, onDone }: { mint: string; symbol: string; feeBps: number; walletType: NonNullable<ReturnType<typeof useAuth>["walletType"]>; onDone: () => void }) {
  const { tr } = useT();
  const [busy, setBusy] = useState<string | null>(null);
  async function buy(sol: string) {
    const raw = toRaw(sol, 9);
    if (!raw) return;
    setBusy(sol);
    try {
      const sig = await executeSwap({ inputMint: SOL_MINT, outputMint: mint, amount: raw, slippageBps: 300 }, walletType);
      toast.success(tr("Bought {symbol}", { symbol }), { action: { label: "Solscan", onClick: () => window.open(`https://solscan.io/tx/${sig}`, "_blank", "noopener") } });
      onDone();
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (!/reject|cancel|denied|declined/i.test(m)) toast.error(tr(m) || tr("Swap failed"));
    }
    setBusy(null);
  }
  return (
    <div>
      <p className="text-sm text-muted-foreground">{tr("One tap, then confirm in your wallet. Slippage 3%.")}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {QUICK.map((a) => (
          <button key={a} disabled={!!busy} onClick={() => buy(a)} className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-muted text-[18px] font-bold text-foreground hover:bg-muted/70 disabled:opacity-50">
            {busy === a ? <Loader2 className="size-5 animate-spin" /> : <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/solana.png" alt="" className="size-5 rounded-full" />{a} SOL</>}
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">{feeBps > 0 ? tr("OM fee {pct}% included", { pct: feeBps / 100 }) : tr("0% OM fee (OM token)")}</p>
    </div>
  );
}

type Holder = { rank: number; owner: string; amount: number; pct: number; isProgram: boolean; name: string | null; avatar: string | null };
function Holders({ mint, price: p }: { mint: string; price: number | null }) {
  const { tr } = useT();
  const [rows, setRows] = useState<Holder[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch(`/api/launchpad/holders/${mint}?light=1`).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setRows((d.holders ?? []).filter((h: Holder) => !h.isProgram))).catch(() => setErr(true));
  }, [mint]);
  if (err) return <p className="py-8 text-center text-sm text-muted-foreground">{tr("Holders unavailable right now.")}</p>;
  if (!rows) return <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">{tr("No holders yet.")}</p>;
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{tr("Biggest holders, excluding pools and programs")}</p>
      {rows.map((h) => (
        <Link key={h.owner} href={`/profile/${h.owner}`} className="flex items-center gap-3 py-2.5">
          {h.avatar
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={h.avatar} alt="" className="size-10 rounded-full object-cover" />
            : <span className="flex size-10 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{h.rank}</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-bold text-foreground">{h.name ?? short(h.owner)}</p>
            <p className="num text-[13px] text-muted-foreground">{h.pct.toFixed(2)}% {tr("of supply")}</p>
          </div>
          <p className="num shrink-0 text-[16px] font-bold text-foreground">{p != null ? compact(h.amount * p, 2) : "-"}</p>
        </Link>
      ))}
    </div>
  );
}

function TokenFeed({ symbol }: { symbol: string }) {
  const { tr } = useT();
  const ok = /^[A-Za-z][A-Za-z0-9]{1,15}$/.test(symbol);
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  useEffect(() => {
    if (!ok) { setPosts([]); return; }
    fetch(`/api/posts?cashtag=${symbol.toUpperCase()}&limit=15`).then((r) => r.json()).then((j) => setPosts(j.posts ?? [])).catch(() => setPosts([]));
  }, [symbol, ok]);
  if (!posts) return <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (!posts.length) return (
    <div className="py-10 text-center">
      <p className="text-sm text-muted-foreground">{tr("No post about ${symbol} yet", { symbol: symbol.toUpperCase() })}</p>
      <Link href="/" className="mt-3 inline-block rounded-xl bg-muted px-4 py-2 text-sm font-semibold text-foreground">{tr("Be the first to post")}</Link>
    </div>
  );
  return <div className="-mx-4 divide-y divide-border">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>;
}

function About({ t, info }: { t: TerminalToken; info: SwapToken | null }) {
  const { tr } = useT();
  const items = useMemo(() => [
    [tr("Market cap"), compact(t.mcap, 2)], [tr("Volume 24h"), compact(t.volume24h, 2)], [tr("Liquidity"), compact(t.liquidity, 2)],
    [tr("Change 24h"), t.change24h != null ? `${t.change24h >= 0 ? "+" : "-"}${pct(t.change24h)}` : "-"],
    [tr("OM fee"), info ? (info.fee_bps > 0 ? `${info.fee_bps / 100}%` : tr("0% (OM token)")) : t.chain && t.chain !== "solana" && t.chain !== "arc" ? "0.3%" : "-"],
    [tr("Pool created"), t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "-"],
  ], [t, info, tr]);
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {items.map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="num mt-1 text-[15px] font-bold text-foreground">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-2xl bg-muted/40 p-3">
        <p className="text-xs text-muted-foreground">{tr("Contract address")}</p>
        <p className="mt-1 break-all font-mono text-[13px] text-foreground">{t.mint}</p>
      </div>
      <div className="mt-3 flex gap-2">
        <a href={`${isEvmChain(t.chain) ? EVM_CHAINS[t.chain].explorer : "https://solscan.io"}/token/${t.mint}`} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-2xl bg-muted/40 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground">{isEvmChain(t.chain) ? `${EVM_CHAINS[t.chain].name} explorer` : "Solscan"}<ExternalLink className="size-3.5" /></a>
        {info?.om_id && <Link href={`/launchpad/${info.om_id}`} className="flex flex-1 items-center justify-center gap-1 rounded-2xl bg-muted/40 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground">{tr("OM token page")}</Link>}
      </div>
    </div>
  );
}
