"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

/**
 * Carnet du mode Limit, en matrice de points animée :
 * chaque ligne remplit une grille de points selon la quantité, les points qui apparaissent s'allument puis se calment,
 * les chiffres qui changent défilent, la ligne centrale montre la capitalisation, le prix et l'écart.
 */
export type BookRow = { mcap: number; sol: number; om: boolean };
export type Book = { mcap: number; price: number; solUsd: number; asks: BookRow[]; bids: BookRow[]; kind?: "sol" };

const COLS = 24;
const DOTS = COLS * 3;
const money = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);
const amt = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n >= 100 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toPrecision(3));
const SUB = "₀₁₂₃₄₅₆₇₈₉";
/** Prix court : les zéros après la virgule sont comptés en indice ($0.0₄214 = $0.0000214) */
export const usd = (p: number) => {
  if (!(p > 0)) return "$0";
  if (p >= 1) return `$${p.toFixed(p >= 1000 ? 0 : 2)}`;
  if (p >= 0.001) return `$${p.toPrecision(3)}`;
  const q = Number(p.toPrecision(3));
  const zeros = Math.floor(-Math.log10(q));
  const digits = Math.round(q * 10 ** (zeros + 3)).toString().slice(0, 3).replace(/0+$/, "") || "0";
  return `$0.0${String(zeros).split("").map((d) => SUB[+d]).join("")}${digits}`;
};

/** Chiffres qui défilent : seuls les caractères qui ont changé glissent depuis le bas. */
export function RollingText({ value, className = "" }: { value: string; className?: string }) {
  // Valeur précédente gardée au moment du changement, pour savoir quels caractères ont bougé
  const [st, setSt] = useState({ v: value, old: value, gen: 0 });
  if (st.v !== value) setSt({ v: value, old: st.v, gen: st.gen + 1 });
  const { old, gen } = st;
  return (
    <span className={`num inline-flex ${className}`} aria-label={value}>
      {value.split("").map((ch, i) => {
        const changed = gen > 0 && old[i] !== ch;
        return <span key={`${i}-${changed ? gen : 0}`} aria-hidden className={changed ? "ob-roll inline-block" : "inline-block"}>{ch}</span>;
      })}
    </span>
  );
}

/** Grille de points : remplie colonne par colonne ; les derniers points sont plus vifs ; les nouveaux s'allument. */
function Dots({ fill, ask, row = 0 }: { fill: number; ask: boolean; row?: number }) {
  const [st, setSt] = useState({ f: fill, from: fill, gen: 0 });
  if (st.f !== fill) setSt({ f: fill, from: st.f, gen: st.gen + 1 });
  const { from, gen } = st;
  const lead = Math.max(0, fill - 4);
  // Le dernier point allumé scintille en continu (décalé selon la ligne) : le carnet reste vivant entre deux mises à jour
  return (
    <span className="ob-dots grid shrink-0" style={{ gridTemplateColumns: `repeat(${COLS}, 4px)`, gridTemplateRows: "repeat(3, 4px)", gridAutoFlow: "column", gap: "2px" }} aria-hidden>
      {Array.from({ length: DOTS }, (_, i) => {
        const on = i < fill;
        const fresh = on && gen > 0 && i >= from;
        // Points qui disparaissent : ils s'éteignent au lieu de couper net
        const gone = !on && gen > 0 && i < from;
        const tip = on && i === fill - 1;
        const cls = !on ? `ob-dot-off ${gone ? (ask ? "ob-dot-gone-ask" : "ob-dot-gone-bid") : ""}` : `${ask ? "ob-dot-ask" : "ob-dot-bid"} ${i >= lead ? "ob-dot-lead" : ""} ${fresh ? "ob-dot-fresh" : ""} ${tip && !fresh ? "ob-dot-tip" : ""}`;
        return <span key={fresh || gone ? `${i}-${gen}` : i} className={`ob-dot ${cls}`} style={tip ? { animationDelay: `${(row % 7) * 0.23}s` } : undefined} />;
      })}
    </span>
  );
}

function Line({ r, ask, max, solUsd, unit, onPick, row }: { r: BookRow; ask: boolean; max: number; solUsd: number; unit: number; onPick: () => void; row: number }) {
  const fill = max > 0 ? Math.max(2, Math.round((r.sol / max) * DOTS)) : 0;
  return (
    <button onClick={onPick} className="flex w-full items-center gap-3 rounded-lg px-1.5 py-[7px] text-left text-[13px] transition-colors hover:bg-foreground/[0.04]">
      <Dots fill={fill} ask={ask} row={row} />
      <RollingText value={usd(r.mcap * unit)} className={`ml-auto w-[74px] justify-end font-semibold ${ask ? "text-down" : "text-up"}`} />
      <span className="flex w-[64px] items-center justify-end gap-1">
        {r.om && <span className="size-1.5 rounded-full bg-foreground" />}
        <RollingText value={amt(r.sol)} className="font-semibold text-foreground" />
      </span>
      <RollingText value={money(r.sol * solUsd)} className="hidden w-[56px] justify-end text-muted-foreground min-[380px]:inline-flex" />
    </button>
  );
}

export function OrderBook({ book, onPick }: { book: Book | null; onPick: (r: BookRow, ask: boolean) => void }) {
  const { tr } = useT();
  const lastPrice = useRef<number | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  // Chaque changement de prix : la ligne centrale s'allume en vert ou en rouge
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (!book) return;
    if (lastPrice.current != null && book.price !== lastPrice.current) { setDir(book.price > lastPrice.current ? 1 : -1); setFlash((f) => f + 1); }
    lastPrice.current = book.price;
  }, [book]);

  if (!book) return <div className="space-y-1.5">{Array.from({ length: 14 }, (_, i) => <div key={i} className="h-[26px] animate-pulse rounded-lg bg-muted" />)}</div>;
  // Prix d'un niveau = prix actuel × (capitalisation du niveau / capitalisation actuelle)
  const unit = book.mcap > 0 ? book.price / book.mcap : 0;
  const max = Math.max(0, ...book.asks.map((r) => r.sol), ...book.bids.map((r) => r.sol));
  const bestAsk = Math.min(...book.asks.map((r) => r.mcap));
  const bestBid = Math.max(...book.bids.map((r) => r.mcap));
  const spread = book.mcap > 0 && isFinite(bestAsk) && isFinite(bestBid) ? ((bestAsk - bestBid) / book.mcap) * 100 : 0;

  return (
    <div>
      <div className="flex items-center gap-3 px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="w-[142px]" />
        <span className="ml-auto w-[74px] whitespace-nowrap text-right">{tr("Price")}</span>
        <span className="w-[64px] text-right">SOL</span>
        <span className="hidden w-[56px] text-right min-[380px]:inline">{tr("Total")}</span>
      </div>
      {book.asks.map((r, i) => <Line key={`a${i}`} row={i} r={r} ask max={max} solUsd={book.solUsd} unit={unit} onPick={() => onPick(r, true)} />)}
      <div key={flash} className={`my-1 flex items-center gap-3 border-y border-border/70 px-1.5 py-2.5 ${flash ? (dir > 0 ? "ob-flash-up" : "ob-flash-down") : ""}`}>
        <RollingText value={usd(book.price)} className="text-[22px] font-bold tracking-tight text-foreground" />
        <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {tr("Mark")}
          <span className={`flex items-center gap-0.5 text-[13px] normal-case tracking-normal ${dir > 0 ? "text-up" : "text-down"}`}>
            <svg width="9" height="8" viewBox="0 0 10 8" className={dir > 0 ? "" : "rotate-180"} fill="currentColor"><path d="M5 0l5 8H0z" /></svg>
            <RollingText value={book.kind === "sol" ? `$${book.price.toFixed(2)}` : usd(book.price)} />
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {tr("Spread")}
          <RollingText value={`${spread.toFixed(1)}%`} className="text-[13px] normal-case tracking-normal text-foreground" />
        </span>
      </div>
      {book.bids.map((r, i) => <Line key={`b${i}`} row={i + 3} r={r} ask={false} max={max} solUsd={book.solUsd} unit={unit} onPick={() => onPick(r, false)} />)}
      <p className="mt-2 flex items-center gap-1.5 px-1.5 text-[10.5px] leading-tight text-muted-foreground"><span className="size-1.5 shrink-0 rounded-full bg-foreground" />{tr("OM limit order")}</p>
    </div>
  );
}
