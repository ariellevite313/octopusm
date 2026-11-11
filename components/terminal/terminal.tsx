"use client";

/** Terminal OM : chercher un token Solana, voir son graphique et l'acheter / le vendre (frais OM 0,3 %, 0 % sur les tokens OM). */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Copy, ExternalLink, Search, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { TokenChart } from "@/components/launchpad/token-chart";
import { SwapBox } from "@/components/swap/swap-box";
import type { TerminalToken } from "@/lib/terminal";

const usd = (n: number | null, d = 2) => n == null ? "-" : n >= 1e9 ? `$${(n / 1e9).toFixed(d)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(d)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(d)}K` : `$${n.toFixed(d)}`;
const price = (n: number | null) => n == null ? "-" : n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : n >= 0.0001 ? `$${n.toFixed(6)}` : `$${n.toPrecision(3)}`;
const isMintLike = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

export function Terminal() {
  const { tr } = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const mint = sp.get("mint") ?? "";
  const [tab, setTab] = useState<"trending" | "new">("trending");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [list, setList] = useState<TerminalToken[] | null>(null);
  const [err, setErr] = useState(false);
  const [picked, setPicked] = useState<TerminalToken | null>(null);

  // Liste (tendance / nouveaux / recherche), 350 ms après la frappe
  useEffect(() => {
    let live = true;
    setList(null); setErr(false);
    const t = setTimeout(async () => {
      try {
        const url = q.trim().length >= 2 ? `/api/terminal?q=${encodeURIComponent(q.trim().replace(/^\$/, ""))}` : `/api/terminal?list=${tab}`;
        const r = await fetch(url);
        const j = await r.json();
        if (live) { setList(j.tokens ?? []); setErr(!r.ok); }
      } catch { if (live) { setList([]); setErr(true); } }
    }, q ? 350 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [tab, q]);

  // Premier token par défaut sur grand écran
  useEffect(() => {
    if (!mint && list?.length && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      router.replace(`/terminal?mint=${list[0].mint}`, { scroll: false });
    }
  }, [mint, list, router]);

  useEffect(() => {
    if (!mint) { setPicked(null); return; }
    const inList = list?.find((t) => t.mint === mint);
    if (inList) { setPicked(inList); return; }
    if (picked?.mint === mint) return;
    // Lien direct vers un mint : on cherche ses infos
    fetch(`/api/terminal?q=${mint}`).then((r) => r.json()).then((j) => {
      const t = (j.tokens ?? []).find((x: TerminalToken) => x.mint === mint);
      setPicked(t ?? { mint, symbol: mint.slice(0, 4), name: mint.slice(0, 4), logo: null, price: null, change24h: null, volume24h: null, mcap: null, liquidity: null, pool: "", createdAt: null });
    }).catch(() => {});
  }, [mint, list, picked?.mint]);

  const open = useCallback((m: string) => router.push(`/terminal?mint=${m}`, { scroll: false }), [router]);

  const listView = (
    <div className="flex min-h-0 flex-col">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search a token or paste a mint")}
          className="h-11 w-full rounded-2xl bg-muted pl-9 pr-9 text-[15px] outline-none placeholder:text-muted-foreground" />
        {q && <button onClick={() => setQ("")} aria-label={tr("Close")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="size-4" /></button>}
      </div>
      {!q && (
        <div className="mt-3 flex gap-2">
          {(["trending", "new"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-xl px-3.5 py-1.5 text-sm font-bold ${tab === k ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {k === "trending" ? tr("Trending") : tr("New")}
            </button>
          ))}
        </div>
      )}
      {q && isMintLike(q.trim()) && (
        <button onClick={() => open(q.trim())} className="mt-3 rounded-2xl bg-muted/60 px-4 py-3 text-left text-sm font-semibold hover:bg-muted">{tr("Open this mint")} <span className="font-mono text-muted-foreground">{q.trim().slice(0, 6)}…{q.trim().slice(-4)}</span></button>
      )}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {list === null ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="my-1.5 h-14 animate-pulse rounded-2xl bg-muted/40" />)
          : list.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{err ? tr("Market data unavailable") : tr("No token found")}</p>
          : list.map((t) => (
            <button key={t.mint} onClick={() => open(t.mint)}
              className={`flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors ${t.mint === mint ? "bg-muted" : "hover:bg-muted/50"}`}>
              <Logo src={t.logo} sym={t.symbol} size="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-foreground">{t.symbol}</p>
                <p className="num truncate text-xs text-muted-foreground">{tr("MC")} {usd(t.mcap, 1)} · {tr("Vol")} {usd(t.volume24h, 1)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="num text-[14px] font-semibold text-foreground">{price(t.price)}</p>
                {t.change24h != null && <p className={`num text-xs font-bold ${t.change24h >= 0 ? "text-up" : "text-down"}`}>{t.change24h >= 0 ? "+" : ""}{t.change24h.toFixed(1)}%</p>}
              </div>
            </button>
          ))}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-28 pt-4 md:pb-10">
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight text-foreground">{tr("Terminal")}</h1>
        <span className="text-sm text-muted-foreground">Solana</span>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)_380px]">
        <aside className={`${mint ? "hidden lg:flex" : "flex"} flex-col lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]`}>{listView}</aside>
        {mint && picked ? (
          <>
            <section className="min-w-0">
              <button onClick={() => router.push("/terminal")} className="mb-3 flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground lg:hidden">
                <ArrowLeft className="size-4" />{tr("Tokens")}
              </button>
              <TokenHead t={picked} />
              <div className="mt-4 overflow-hidden rounded-3xl bg-card ring-1 ring-border">
                <TokenChart key={mint} mintAddress={mint} name={picked.name} ticker={picked.symbol} logoUrl={picked.logo ?? undefined} />
              </div>
              <Stats t={picked} />
            </section>
            <aside className="lg:sticky lg:top-20 lg:self-start"><SwapBox key={mint} mint={mint} /></aside>
          </>
        ) : mint ? <div className="h-96 animate-pulse rounded-3xl bg-card lg:col-span-2" /> : null}
      </div>
    </div>
  );
}

function Logo({ src, sym, size }: { src: string | null; sym: string; size: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" loading="lazy" className={`${size} shrink-0 rounded-full bg-muted object-cover`} />
    : <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground`}>{sym.slice(0, 1)}</span>;
}

function TokenHead({ t }: { t: TerminalToken }) {
  const [copied, setCopied] = useState(false);
  const up = (t.change24h ?? 0) >= 0;
  return (
    <div className="flex items-center gap-3">
      <Logo src={t.logo} sym={t.symbol} size="size-12" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[20px] font-extrabold text-foreground">{t.name} <span className="text-muted-foreground">{t.symbol}</span></p>
        <button onClick={() => navigator.clipboard.writeText(t.mint).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
          className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground">
          {t.mint.slice(0, 6)}…{t.mint.slice(-6)}{copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-[20px] font-bold text-foreground">{price(t.price)}</p>
        {t.change24h != null && <p className={`num text-sm font-bold ${up ? "text-up" : "text-down"}`}>{up ? "+" : ""}{t.change24h.toFixed(2)}%</p>}
      </div>
    </div>
  );
}

function Stats({ t }: { t: TerminalToken }) {
  const { tr } = useT();
  const items = useMemo(() => [
    [tr("Market cap"), usd(t.mcap)], [tr("Volume 24h"), usd(t.volume24h)], [tr("Liquidity"), usd(t.liquidity)],
  ], [t, tr]);
  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-2xl bg-card p-3 ring-1 ring-border">
          <p className="text-xs text-muted-foreground">{k}</p>
          <p className="num mt-1 text-[15px] font-bold text-foreground">{v}</p>
        </div>
      ))}
      <a href={`https://solscan.io/token/${t.mint}`} target="_blank" rel="noopener noreferrer"
        className="col-span-3 flex items-center justify-center gap-1 rounded-2xl bg-muted/50 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
        Solscan <ExternalLink className="size-3" />
      </a>
    </div>
  );
}
