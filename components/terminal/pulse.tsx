"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { CHAINS, GT_NET, type TerminalChain } from "@/lib/terminal";
import type { Pulse, PulseToken } from "@/lib/terminal-pulse";
import { onNewToken, onTokenTrade, solUsd } from "@/lib/pumpportal";

const money = (n: number | null | undefined) => (!n ? "-" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);
function age(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
}
const DEX: Record<string, string> = { om: "OMdotfun", "aerodrome-base": "Aerodrome", "aerodrome-slipstream": "Aerodrome", bags: "Bags", "pump-fun": "Pump", "meteora-dbc": "Meteora", "letsbonk-fun": "Bonk", "raydium-launchlab": "LaunchLab", pumpswap: "PumpSwap", "meteora-damm-v2": "Meteora", meteora: "Meteora", raydium: "Raydium", "raydium-cpmm": "Raydium", uniswap_v4_base: "Uniswap", "uniswap-v4-base": "Uniswap", aerodrome: "Aerodrome", "pancakeswap-v3-bsc": "Pancake", "pancakeswap_v2": "Pancake" };
const dexName = (id: string) => DEX[id] ?? id.replace(/[-_](v\d.*|base|bsc|eth|arbitrum|polygon|avax)$/i, "").replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Logos des plateformes (sans fond), affichés à la place de leur nom */
const DEX_LOGO: Record<string, string> = { om: "/omdot-icon.png", bags: "/dex/bags.png", "letsbonk-fun": "/dex/bonk.png", raydium: "/dex/raydium.png", "raydium-cpmm": "/dex/raydium.png", "raydium-clmm": "/dex/raydium.png", "raydium-launchlab": "/dex/raydium.png", "pump-fun": "/dex/pump.png", pumpswap: "/dex/pump.png", "meteora-dbc": "/dex/meteora.png", "meteora-damm-v2": "/dex/meteora.png", meteora: "/dex/meteora.png" };

/** Plateformes reconnues par le début de leur identifiant GeckoTerminal (ex. aerodrome-base, aerodrome-slipstream) */
const DEX_PREFIX: [string, string][] = [["traderjoe", "/dex/traderjoe.png"], ["trader-joe", "/dex/traderjoe.png"], ["four", "/dex/four.png"], ["pancakeswap", "/dex/pancake.png"], ["sushi", "/dex/sushi.png"], ["clanker", "/dex/clanker.png"], ["zora", "/dex/zora.png"], ["uniswap", "/dex/uniswap.png"], ["aerodrome", "/dex/aerodrome.png"], ["raydium", "/dex/raydium.png"], ["meteora", "/dex/meteora.png"], ["pump", "/dex/pump.png"]];
const dexLogo = (id: string) => DEX_LOGO[id] ?? DEX_PREFIX.find(([p]) => id.startsWith(p))?.[1] ?? null;

/** Pulse fonctionne sur les réseaux suivis par GeckoTerminal */
const PULSE_CHAINS = CHAINS.filter((c) => c.ready && GT_NET[c.id]);
const MAX = 60;

function Row({ t, onOpen, flash }: { t: PulseToken; onOpen: (t: PulseToken) => void; flash: boolean }) {
  const up = (t.change1h ?? 0) >= 0;
  // Tokens Bags : lancés sur Meteora, leur adresse se termine par « BAGS »
  const dex = t.dexId !== "om" && t.mint.endsWith("BAGS") ? "bags" : t.dexId;
  return (
    <button onClick={() => onOpen(t)} className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors duration-700 hover:bg-muted/50 ${flash ? "bg-up/10" : ""}`}>
      {t.logo
        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.logo} alt="" className="size-10 shrink-0 rounded-lg bg-muted object-cover" />
        : <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-[12px] font-bold text-muted-foreground">{t.symbol.slice(0, 2).toUpperCase()}</span>}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-foreground"><span className="truncate">{t.symbol}</span><span className="num shrink-0 text-[12px] font-medium text-muted-foreground">{age(t.createdAt)}</span></p>
        <p className="flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
          {dexLogo(dex)
            ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={dexLogo(dex)!} alt={dexName(dex)} title={dexName(dex)} className="size-3.5 shrink-0 object-contain" />
            : <span className="shrink-0">{dexName(dex)} ·</span>}
          <span className="truncate">{t.name}</span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-[13px] font-semibold text-foreground">MC {money(t.mcap)}</p>
        <p className="num text-[12px] text-muted-foreground">V {money(t.volume24h)}{t.change1h != null && <span className={`ml-1.5 ${up ? "text-up" : "text-down"}`}>{up ? "+" : ""}{t.change1h.toFixed(0)}%</span>}</p>
      </div>
    </button>
  );
}

/** Fusionne une nouvelle liste dans l'ancienne : rien ne disparaît d'un coup, les chiffres sont mis à jour. */
function merge(prev: PulseToken[], next: PulseToken[], sort: (a: PulseToken, b: PulseToken) => number): PulseToken[] {
  if (!next.length) return prev;
  const by = new Map(prev.map((t) => [t.mint, t]));
  for (const t of next) { const o = by.get(t.mint); by.set(t.mint, o ? { ...o, ...t, logo: t.logo ?? o.logo, mcap: t.mcap ?? o.mcap } : t); }
  return [...by.values()].sort(sort).slice(0, MAX);
}
const byNew = (a: PulseToken, b: PulseToken) => Date.parse(b.createdAt ?? "0") - Date.parse(a.createdAt ?? "0");
const byMcap = (a: PulseToken, b: PulseToken) => (b.mcap ?? 0) - (a.mcap ?? 0);

/**
 * Vue Pulse : nouveaux tokens, proches de la graduation, tout juste migrés.
 * Solana : nouveaux tokens pump.fun et LetsBonk en temps réel (PumpPortal), capitalisation mise à jour à chaque trade.
 * Tous réseaux : rafraîchi toutes les 15 s sans jamais vider la liste.
 */
export function PulseView({ onOpen, pass = () => true }: { onOpen: (t: PulseToken) => void; pass?: (t: PulseToken) => boolean }) {
  const { tr } = useT();
  const [chain, setChain] = useState<TerminalChain>("solana");
  const [p, setP] = useState<Pulse | null>(null);
  const [col, setCol] = useState<keyof Pulse>("fresh");
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [, tick] = useState(0);
  const sol = useRef<number | null>(null);

  useEffect(() => { try { const c = localStorage.getItem("om_pulse_chain"); if (c && PULSE_CHAINS.some((x) => x.id === c)) setChain(c as TerminalChain); } catch { /* ignore */ } }, []);
  const pick = (c: TerminalChain) => { setChain(c); setP(null); try { localStorage.setItem("om_pulse_chain", c); } catch { /* ignore */ } };

  // Listes du serveur, fusionnées (jamais remplacées par une liste vide)
  useEffect(() => {
    let off = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/terminal/pulse?chain=${chain}`).then((r) => (r.ok ? r.json() : null)).then((j: Pulse | null) => {
        if (off || !j?.fresh) return;
        setP((x) => x ? { fresh: merge(x.fresh, j.fresh, byNew), stretch: j.stretch.length ? j.stretch : x.stretch, migrated: merge(x.migrated, j.migrated, byNew) } : j);
      }).catch(() => {});
    };
    load();
    const every = setInterval(load, 15_000);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => { off = true; clearInterval(every); clearInterval(clock); };
  }, [chain]);

  // Solana : nouveaux tokens à la seconde
  useEffect(() => {
    if (chain !== "solana") return;
    solUsd().then((v) => { sol.current = v; });
    const stop = onNewToken((m) => {
      const s = sol.current;
      const t: PulseToken = {
        mint: m.mint, symbol: String(m.symbol || "?").slice(0, 16), name: String(m.name || "").slice(0, 40), logo: null,
        price: null, change24h: null, volume24h: null, mcap: s && m.marketCapSol ? m.marketCapSol * s : null, liquidity: null,
        pool: m.bondingCurveKey ?? "", createdAt: new Date().toISOString(), chain: "solana", dexId: m.pool === "bonk" ? "letsbonk-fun" : "pump-fun",
      };
      setP((x) => ({ fresh: merge(x?.fresh ?? [], [t], byNew), stretch: x?.stretch ?? [], migrated: x?.migrated ?? [] }));
      setFresh((f) => new Set(f).add(t.mint));
      setTimeout(() => setFresh((f) => { const n = new Set(f); n.delete(t.mint); return n; }), 1500);
      // Image : dans les métadonnées du token
      if (m.uri) fetch(`/api/terminal/meta?uri=${encodeURIComponent(m.uri)}`).then((r) => r.json()).then((j: { image?: string | null }) => {
        if (j.image) setP((x) => x && { ...x, fresh: x.fresh.map((y) => (y.mint === t.mint && !y.logo ? { ...y, logo: j.image ?? null } : y)) });
      }).catch(() => {});
    });
    return stop;
  }, [chain]);

  // Solana : capitalisation et volume des tokens affichés mis à jour à chaque trade
  const watch = useMemo(() => (chain === "solana" && p ? p[col].slice(0, 30).map((t) => t.mint) : []), [chain, p, col]);
  const watchKey = watch.join(",");
  useEffect(() => {
    if (!watchKey) return;
    const stops = watchKey.split(",").map((mint) => onTokenTrade(mint, (tr0) => {
      const s = sol.current;
      if (!s) return;
      const upd = (l: PulseToken[]) => l.map((y) => (y.mint === mint ? { ...y, mcap: tr0.marketCapSol ? tr0.marketCapSol * s : y.mcap, volume24h: (y.volume24h ?? 0) + tr0.solAmount * s } : y));
      setP((x) => x && { fresh: upd(x.fresh), stretch: upd(x.stretch), migrated: upd(x.migrated) });
    }));
    return () => stops.forEach((f) => f());
  }, [watchKey]);

  const cols: [keyof Pulse, string][] = chain === "solana"
    ? [["fresh", tr("New")], ["stretch", tr("Final stretch")], ["migrated", tr("Migrated")]]
    : [["fresh", tr("New")], ["stretch", tr("Top volume")], ["migrated", tr("Liquidity")]];
  const list = (k: keyof Pulse) => {
    if (!p) return Array.from({ length: 6 }, (_, i) => <div key={i} className="my-1.5 h-12 animate-pulse rounded-xl bg-muted/40" />);
    const rows = (k === "stretch" && chain === "solana" ? [...p[k]].sort(byMcap) : p[k]).filter(pass);
    return rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{tr("No token found")}</p>
      : rows.map((t) => <Row key={t.mint} t={t} onOpen={onOpen} flash={fresh.has(t.mint)} />);
  };
  return (
    <div className="mt-3">
      <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {PULSE_CHAINS.map((c) => (
          <button key={c.id} onClick={() => pick(c.id)} className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold ${chain === c.id ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:text-foreground"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.logo} alt="" className="size-4 rounded-full" />{c.name}
          </button>
        ))}
      </div>
      {/* Une colonne à la fois (la liste du Terminal est étroite, même sur ordinateur) */}
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {cols.map(([k, label]) => <button key={k} onClick={() => setCol(k)} className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${col === k ? "bg-background text-foreground" : "text-muted-foreground"}`}>{label}</button>)}
      </div>
      <div className="mt-2">{list(col)}</div>
    </div>
  );
}
