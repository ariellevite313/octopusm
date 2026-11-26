"use client";

/**
 * Tableau plein écran des tokens sur ordinateur (comme GMGN) : âge, liquidité, capitalisation, transactions et volume
 * de la dernière heure, prix, variations 5 min / 1 h / 24 h, infos DexScreener et liens. Tri en touchant un en-tête.
 * La ligne secoue à chaque changement de prix (style Pump.fun). Échap ou le bouton ferme.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Globe, Minimize2, Send } from "lucide-react";
import { useT } from "@/lib/i18n";
import { logoFor, type TerminalToken } from "@/lib/terminal";
import { TradeFlash } from "@/components/shared/trade-flash";

type Key = "age" | "liq" | "mcap" | "tx" | "vol1h" | "vol24h" | "price" | "c5m" | "c1h" | "c24h";

const usd = (n: number | null | undefined, d = 1) => n == null ? "-" : n >= 1e9 ? `$${(n / 1e9).toFixed(d)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(d)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(d)}K` : `$${n.toFixed(2)}`;
const int = (n: number) => n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);
function px(n: number | null): string {
  if (n == null) return "-";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 2 : 4 })}`;
  const z = Math.max(0, -Math.floor(Math.log10(n)) - 1);
  return z >= 4 ? `$0.0${String.fromCharCode(8320 + Math.min(z, 9))}${(n * 10 ** z).toFixed(4).slice(2, 6)}` : `$${n.toPrecision(3)}`;
}
function age(iso: string | null): string {
  if (!iso) return "-";
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}
function Pct({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-muted-foreground">-</span>;
  return <span className={v >= 0 ? "text-up" : "text-down"}>{v >= 0 ? "+" : ""}{Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(1)}%</span>;
}
const val = (t: TerminalToken, k: Key): number => {
  const n = (x: number | null | undefined) => (x == null ? -Infinity : x);
  switch (k) {
    case "age": return t.createdAt ? -new Date(t.createdAt).getTime() : -Infinity;
    case "liq": return n(t.liquidity);
    case "mcap": return n(t.mcap);
    case "tx": return t.txns1h ? t.txns1h.buys + t.txns1h.sells : -Infinity;
    case "vol1h": return n(t.volume1h);
    case "vol24h": return n(t.volume24h);
    case "price": return n(t.price);
    case "c5m": return n(t.change5m);
    case "c1h": return n(t.change1h);
    case "c24h": return n(t.change24h);
  }
};

export function TokenTable({ rows, active, onOpen, onClose, tabs }: {
  rows: TerminalToken[]; active: string | null; onOpen: (t: TerminalToken) => void; onClose: () => void;
  /** Listes (Trending, Crypto, Stocks…) affichées en haut, comme dans le Terminal */
  tabs: { key: string; label: string; on: boolean; pick: () => void }[];
}) {
  const { tr } = useT();
  const root = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<{ k: Key; desc: boolean } | null>(null);

  // Plein écran du navigateur quand c'est possible ; Échap ferme
  useEffect(() => {
    root.current?.requestFullscreen?.().catch(() => {});
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.fullscreenElement) onClose(); };
    const fs = () => { if (!document.fullscreenElement) onClose(); };
    window.addEventListener("keydown", k);
    document.addEventListener("fullscreenchange", fs);
    return () => { window.removeEventListener("keydown", k); document.removeEventListener("fullscreenchange", fs); if (document.fullscreenElement) void document.exitFullscreen(); };
  }, [onClose]);

  const list = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => (val(b, sort.k) - val(a, sort.k)) * (sort.desc ? 1 : -1));
  }, [rows, sort]);

  const H = ({ k, children, right = true }: { k: Key; children: React.ReactNode; right?: boolean }) => (
    <th className={`px-3 py-3 font-semibold ${right ? "text-right" : "text-left"}`}>
      <button onClick={() => setSort((s) => (s?.k === k ? (s.desc ? { k, desc: false } : null) : { k, desc: true }))}
        className={`inline-flex items-center gap-1 ${sort?.k === k ? "text-foreground" : "hover:text-foreground"}`}>
        {children}{sort?.k === k && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );

  return (
    <div ref={root} className="fixed inset-0 z-[120] flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <span className="mr-3 text-[18px] font-bold">{tr("Tokens")}</span>
        {tabs.map((t) => (
          <button key={t.key} onClick={t.pick} className={`h-9 rounded-xl px-3.5 text-[14px] font-semibold ${t.on ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
        <span className="num ml-auto text-[13px] text-muted-foreground">{list.length} tokens</span>
        <button onClick={onClose} title={tr("Exit full screen")} aria-label={tr("Exit full screen")} className="ml-2 flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
          <Minimize2 className="size-[18px]" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="num w-full min-w-[1100px] border-collapse text-[14px]">
          <thead className="sticky top-0 z-10 bg-background text-[12px] text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-5 py-3 text-left font-semibold">{tr("Token")}</th>
              <H k="age" right={false}>{tr("Age")}</H>
              <H k="liq">{tr("Liquidity")}</H>
              <H k="mcap">{tr("Market cap")}</H>
              <H k="tx">{tr("1h TXs")}</H>
              <H k="vol1h">{tr("1h Vol")}</H>
              <H k="vol24h">{tr("24h Vol")}</H>
              <H k="price">{tr("Price")}</H>
              <H k="c5m">5m%</H>
              <H k="c1h">1h%</H>
              <H k="c24h">24h%</H>
              <th className="px-5 py-3 text-right font-semibold">DexScreener</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => {
              const x = t.dex?.socials.find((s) => s.type === "twitter")?.url;
              const tg = t.dex?.socials.find((s) => s.type === "telegram")?.url;
              const logo = logoFor(t.mint, t.logo);
              return (
                <tr key={`${t.chain ?? "solana"}:${t.mint}`} onClick={() => onOpen(t)}
                  className={`cursor-pointer border-b border-border/60 transition-colors ${t.mint === active ? "bg-muted" : "hover:bg-muted/40"}`}>
                  <td className="px-5 py-2.5">
                    <TradeFlash v={t.price} className="rounded-xl">
                      <div className="flex items-center gap-3">
                        <span className="relative shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {logo ? <img src={logo} alt="" className="size-10 rounded-full object-cover" /> : <span className="flex size-10 items-center justify-center rounded-full bg-muted text-[14px] font-bold">{t.symbol.slice(0, 1)}</span>}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={t.badge ?? `/chains/${t.chain ?? "solana"}.png`} alt="" className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full object-cover ring-2 ring-background" />
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-[180px] truncate text-[15px] font-bold text-foreground">{t.symbol}</p>
                          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                            <span className="font-mono">{t.mint.slice(0, 4)}…{t.mint.slice(-4)}</span>
                            {x && <a href={x} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label="X" className="hover:text-foreground"><svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" /></svg></a>}
                            {tg && <a href={tg} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Telegram" className="hover:text-foreground"><Send className="size-3.5" /></a>}
                            {t.dex?.website && <a href={t.dex.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label={tr("Website")} className="hover:text-foreground"><Globe className="size-3.5" /></a>}
                          </p>
                        </div>
                      </div>
                    </TradeFlash>
                  </td>
                  <td className="px-3 py-2.5 text-left text-muted-foreground">{age(t.createdAt)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{usd(t.liquidity)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{usd(t.mcap)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {t.txns1h ? <><p className="font-semibold">{int(t.txns1h.buys + t.txns1h.sells)}</p><p className="text-[12px]"><span className="text-up">{int(t.txns1h.buys)}</span><span className="text-muted-foreground">/</span><span className="text-down">{int(t.txns1h.sells)}</span></p></> : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">{usd(t.volume1h)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{usd(t.volume24h)}</td>
                  <td className="px-3 py-2.5 text-right">{px(t.price)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold"><Pct v={t.change5m} /></td>
                  <td className="px-3 py-2.5 text-right font-semibold"><Pct v={t.change1h} /></td>
                  <td className="px-3 py-2.5 text-right font-semibold"><Pct v={t.change24h} /></td>
                  <td className="px-5 py-2.5 text-right text-[12px]">
                    {t.dex?.paid && <span className="mr-1 rounded bg-muted px-1.5 py-0.5 font-semibold text-foreground">{tr("Dex paid")}</span>}
                    {(t.dex?.boost ?? 0) > 0 && <span className="rounded bg-muted px-1.5 py-0.5 font-semibold text-foreground">{tr("Boost")}</span>}
                    {!t.dex?.paid && !(t.dex?.boost ?? 0) && <span className="text-muted-foreground">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
