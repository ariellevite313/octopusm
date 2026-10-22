"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, X, Clock, Hash } from "lucide-react";
import { useT } from "@/lib/i18n";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import { shortAddress } from "@/lib/format";

type Token = { id: string; name: string; ticker: string; logo: string | null; chain: string; market_cap_usd: number | null; price_usd: number | null; href: string };
type Post = { id: string; body: string; image: string | null; created_at: string; author: string; author_name: string | null; author_avatar: string | null; author_octo: number };
type Account = { wallet: string; username: string | null; name: string | null; avatar: string | null; octo: number };
type Res = { tokens: Token[]; posts: Post[]; accounts: Account[] };
type Tab = "all" | "tokens" | "posts" | "accounts";

const KEY = "om_recent_search";
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]").slice(0, 6); } catch { return []; } };
const saveRecent = (q: string) => { try { localStorage.setItem(KEY, JSON.stringify([q, ...readRecent().filter((x) => x !== q)].slice(0, 6))); } catch { /* stockage indisponible */ } };

const usd = (n: number | null) => n == null ? "" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
const price = (n: number | null) => n == null ? "" : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(3)}`;
const ago = (iso: string) => { const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

/** Mot cherché surligné dans un extrait */
function Hl({ text, q }: { text: string; q: string }) {
  const k = q.replace(/^[#$@]/, "").trim();
  if (!k) return <>{text}</>;
  const i = text.toLowerCase().indexOf(k.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <span>{text.slice(0, i)}<mark className="rounded-sm bg-primary/20 text-foreground">{text.slice(i, i + k.length)}</mark>{text.slice(i + k.length)}</span>;
}

/** Loupe en verre transparent : ouvre la recherche (tokens, posts, comptes). */
export function SearchButton({ className = "" }: { className?: string }) {
  const { tr } = useT();
  return (
    <button
      type="button"
      aria-label={tr("Search")}
      title={tr("Search")}
      onClick={() => window.dispatchEvent(new CustomEvent("open-search"))}
      className={`glass-btn flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-transform active:scale-95 ${className}`}
    >
      <Search className="size-[19px]" strokeWidth={2.2} />
    </button>
  );
}

export function SearchOverlay() {
  const { tr } = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [res, setRes] = useState<Res | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<string | undefined>).detail; setQ(typeof d === "string" ? d : ""); setOpen(true); setRecent(readRecent()); };
    window.addEventListener("open-search", h);
    return () => window.removeEventListener("open-search", h);
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 30);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const s = q.trim();
    if (!s || s.replace(/^[#$@]/, "").length < 1) { setRes(null); return; }
    setLoading(true);
    let off = false;
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(s)}&type=${tab}`).then((r) => r.json()).then((j) => { if (!off) { setRes({ tokens: j.tokens ?? [], posts: j.posts ?? [], accounts: j.accounts ?? [] }); setLoading(false); } })
        .catch(() => { if (!off) { setRes({ tokens: [], posts: [], accounts: [] }); setLoading(false); } });
    }, 250);
    return () => { off = true; clearTimeout(id); };
  }, [q, tab]);

  if (!open) return null;
  const done = () => { if (q.trim()) saveRecent(q.trim()); setOpen(false); };
  const empty = res && res.tokens.length + res.posts.length + res.accounts.length === 0;
  const TABS: [Tab, string][] = [["all", tr("All")], ["tokens", tr("Tokens")], ["posts", tr("Posts")], ["accounts", tr("Accounts")]];
  const show = (t: Tab) => tab === "all" || tab === t;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex justify-center bg-background md:bg-black/40 md:backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="flex h-full w-full flex-col bg-background md:mt-[8vh] md:h-[80vh] md:max-w-xl md:overflow-hidden md:rounded-3xl md:border md:border-border md:shadow-2xl">
        <div className="flex items-center gap-2 px-3 pt-3" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
          <label className="glass-btn flex h-12 flex-1 items-center gap-3 rounded-full px-4">
            <Search className="size-[18px] shrink-0 text-muted-foreground" />
            <input
              ref={input}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) saveRecent(q.trim()); }}
              placeholder={tr("Search tokens, posts, people")}
              className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              enterKeyHint="search"
            />
            {q && <button type="button" onClick={() => setQ("")} aria-label={tr("Clear")} className="text-muted-foreground"><X className="size-4" /></button>}
          </label>
          <button type="button" onClick={() => setOpen(false)} className="px-2 text-[15px] font-semibold text-foreground">{tr("Cancel")}</button>
        </div>

        <div className="mt-2 flex border-b border-border">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 py-3 text-[15px] font-bold ${tab === k ? "text-foreground shadow-[inset_0_-2px_0_currentColor]" : "text-muted-foreground"}`}>{label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pb-10">
          {!q.trim() ? (
            recent.length > 0 && (
              <div className="px-4 py-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{tr("Recent")}</p>
                {recent.map((r) => (
                  <button key={r} onClick={() => setQ(r)} className="flex w-full items-center gap-3 py-2 text-left text-[15px]"><Clock className="size-4 text-muted-foreground" />{r}</button>
                ))}
              </div>
            )
          ) : loading && !res ? (
            <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-2xl bg-muted/60" />)}</div>
          ) : empty ? (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">{tr("No results.")}</p>
          ) : res && (
            <>
              {show("tokens") && res.tokens.length > 0 && (
                <section>
                  {tab === "all" && <p className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{tr("Tokens")}</p>}
                  {res.tokens.map((t) => (
                    <Link key={t.id} href={t.href} onClick={done} className="flex items-center gap-3 border-b border-border px-4 py-3 hover:bg-muted/50">
                      {t.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.logo} alt="" className="size-11 rounded-xl object-cover" />
                      ) : <span className="flex size-11 items-center justify-center rounded-xl bg-muted font-bold">{t.ticker[0]}</span>}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold"><Hl text={t.name} q={q} /></span>
                        <span className="block text-[13px] text-muted-foreground">${t.ticker} · {t.chain === "arc" ? "Arc" : "Solana"}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-[15px] font-bold">{price(t.price_usd)}</span>
                        {t.market_cap_usd != null && <span className="block text-[13px] text-muted-foreground">MC {usd(t.market_cap_usd)}</span>}
                      </span>
                    </Link>
                  ))}
                </section>
              )}
              {show("posts") && res.posts.length > 0 && (
                <section>
                  {tab === "all" && <p className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{tr("Posts")}</p>}
                  {res.posts.map((p) => {
                    const name = p.author_name ?? shortAddress(p.author);
                    return (
                      <Link key={p.id} href={`/post/${p.id}`} onClick={done} className="flex gap-3 border-b border-border px-4 py-3 hover:bg-muted/50">
                        {p.author_avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.author_avatar} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                        ) : <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{name[0]?.toUpperCase()}</span>}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm font-bold">{name}<OctoBadge totalOcto={p.author_octo} size={14} /><span className="font-normal text-muted-foreground">· {ago(p.created_at)}</span></span>
                          <span className="line-clamp-3 text-[14px] leading-snug"><Hl text={p.body} q={q} /></span>
                        </span>
                        {p.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                        )}
                      </Link>
                    );
                  })}
                </section>
              )}
              {show("accounts") && res.accounts.length > 0 && (
                <section>
                  {tab === "all" && <p className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{tr("Accounts")}</p>}
                  {res.accounts.map((u) => {
                    const name = u.name ?? shortAddress(u.wallet);
                    return (
                      <Link key={u.wallet} href={`/profile/${u.wallet}`} onClick={done} className="flex items-center gap-3 border-b border-border px-4 py-3 hover:bg-muted/50">
                        {u.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.avatar} alt="" className="size-10 rounded-full object-cover" />
                        ) : <span className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{name[0]?.toUpperCase()}</span>}
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 font-bold"><Hl text={name} q={q} /><OctoBadge totalOcto={u.octo} size={15} /></span>
                          <span className="block text-sm text-muted-foreground">{u.username ? `@${u.username}` : shortAddress(u.wallet)}</span>
                        </span>
                      </Link>
                    );
                  })}
                </section>
              )}
              {q.trim().startsWith("#") && (
                <Link href={`/?tag=${encodeURIComponent(q.trim().slice(1).toLowerCase())}`} onClick={done} className="flex items-center gap-3 px-4 py-4 text-[15px] font-semibold text-primary"><Hash className="size-4" />{tr("See all posts with")} {q.trim()}</Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
