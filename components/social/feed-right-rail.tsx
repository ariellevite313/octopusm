"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Hash, Search } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";

type Trend = { kind: "tag" | "token"; label: string; count: number; href: string; logo: string | null; name: string | null };
type Who = { wallet: string; username: string | null; name: string | null; avatar: string | null; followers: number };

function Pic({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{name[0]?.toUpperCase()}</span>
  );
}

/** Colonne de droite du fil (grand écran) : recherche, tendances, comptes à suivre. */
export function FeedRightRail() {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [trending, setTrending] = useState<Trend[] | null>(null);
  const [who, setWho] = useState<Who[] | null>(null);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let off = false;
    fetch("/api/social/sidebar", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (off) return;
      setTrending(j.trending ?? []); setWho(j.who ?? []);
    }).catch(() => { if (!off) { setTrending([]); setWho([]); } });
    return () => { off = true; };
  }, [isAuthenticated]);

  async function follow(w: string) {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    setFollowed((m) => ({ ...m, [w]: !m[w] }));
    const r = await fetch("/api/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: w }) }).catch(() => null);
    if (!r?.ok) setFollowed((m) => ({ ...m, [w]: !m[w] }));
    else { const j = await r.json(); setFollowed((m) => ({ ...m, [w]: !!j.is_following })); }
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-[350px] shrink-0 space-y-4 overflow-y-auto scrollbar-none py-3 pl-6 xl:block">
      {/* Recherche : ouvre la recherche complète (tokens, posts, comptes) */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("open-search"))}
        className="glass-btn flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-left text-[15px] text-muted-foreground"
      >
        <Search className="size-[18px]" />{tr("Search tokens, posts, people")}
      </button>

      {/* Tendances */}
      <section className="overflow-hidden rounded-2xl border border-border">
        <h2 className="px-4 pb-1 pt-3 text-xl font-extrabold tracking-tight">{tr("Trending")}</h2>
        {trending === null ? (
          <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-xl bg-muted/50" />)}</div>
        ) : trending.length === 0 ? (
          <p className="px-4 pb-4 pt-1 text-sm text-muted-foreground">{tr("Nothing trending yet.")}</p>
        ) : (
          trending.map((t) => (
            <Link key={t.kind + t.label} href={t.href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">{t.kind === "token" ? (t.name ?? tr("Token")) : tr("Hashtag")}</span>
                <span className="block truncate text-[15px] font-bold">{t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.count} {tr(t.count === 1 ? "post" : "posts")}</span>
              </span>
              {t.kind === "token" && t.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logo} alt="" className="size-10 rounded-xl object-cover" />
              ) : (
                <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Hash className="size-5" /></span>
              )}
            </Link>
          ))
        )}
      </section>

      {/* Comptes à suivre */}
      <section className="overflow-hidden rounded-2xl border border-border">
        <h2 className="px-4 pb-1 pt-3 text-xl font-extrabold tracking-tight">{tr("Who to follow")}</h2>
        {who === null ? (
          <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-muted/50" />)}</div>
        ) : who.length === 0 ? (
          <p className="px-4 pb-4 pt-1 text-sm text-muted-foreground">{tr("No suggestions for now.")}</p>
        ) : (
          who.map((u) => {
            const name = u.name ?? u.username ?? shortAddress(u.wallet);
            const on = !!followed[u.wallet];
            return (
              <div key={u.wallet} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <Link href={`/profile/${u.wallet}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Pic src={u.avatar} name={name} />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-bold">{name}</span>
                    <span className="block truncate text-sm text-muted-foreground">{u.username ? `@${u.username}` : shortAddress(u.wallet)}</span>
                  </span>
                </Link>
                <button
                  onClick={() => follow(u.wallet)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${on ? "border border-border text-foreground hover:bg-muted" : "bg-foreground text-background hover:opacity-90"}`}
                >
                  {on ? tr("Following") : tr("Follow")}
                </button>
              </div>
            );
          })
        )}
      </section>

      <p className="px-2 pb-6 text-xs text-muted-foreground">
        <Link href="/policy" className="hover:underline">{tr("ŌM Policy")}</Link> · <Link href="/privacy" className="hover:underline">{tr("Privacy Policy")}</Link> · <Link href="/faq" className="hover:underline">{tr("FAQ")}</Link> · © 2026 OMdotfun
      </p>
    </aside>
  );
}

/** « Who to follow » glissé dans le fil (téléphone et écrans moyens ; sur grand écran il est à droite). */
export function WhoToFollowInline() {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [who, setWho] = useState<Who[]>([]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches) return;
    let off = false;
    fetch("/api/social/sidebar", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (!off) setWho(j.who ?? []); }).catch(() => {});
    return () => { off = true; };
  }, [isAuthenticated]);
  if (who.length === 0) return null;
  async function follow(w: string) {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    setFollowed((m) => ({ ...m, [w]: !m[w] }));
    const r = await fetch("/api/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: w }) }).catch(() => null);
    if (!r?.ok) setFollowed((m) => ({ ...m, [w]: !m[w] }));
  }
  return (
    <section className="border-t border-border bg-card px-4 py-3 xl:hidden">
      <h2 className="pb-1 text-lg font-extrabold tracking-tight">{tr("Who to follow")}</h2>
      {who.map((u) => {
        const name = u.name ?? u.username ?? shortAddress(u.wallet);
        const on = !!followed[u.wallet];
        return (
          <div key={u.wallet} className="flex items-center gap-3 py-2">
            <Link href={`/profile/${u.wallet}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Pic src={u.avatar} name={name} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold">{name}</span>
                <span className="block truncate text-sm text-muted-foreground">{u.username ? `@${u.username}` : shortAddress(u.wallet)}</span>
              </span>
            </Link>
            <button onClick={() => follow(u.wallet)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold ${on ? "border border-border text-foreground" : "bg-foreground text-background"}`}>
              {on ? tr("Following") : tr("Follow")}
            </button>
          </div>
        );
      })}
    </section>
  );
}
