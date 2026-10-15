"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { Clock } from "lucide-react";
import { useFakeLiveBets, FakeBetOverlay } from "@/components/market/market-fake-bets";
import { formatVolume } from "@/lib/market/utils";

interface UpDownMarket {
  id: string;
  symbol: string;
  duration_min: number;
  strike_price: number;
  closes_at: string;
  status: "open" | "resolved" | "cancelled";
  outcome: "up" | "down" | null;
  pool_up: number;
  pool_down: number;
  fee_rate: number;
  open_price: number | null;
}

const SYMBOLS = [
  { value: "BTCUSDT",  label: "Bitcoin",  short: "BTC",  color: "#f59e0b" },
  { value: "ETHUSDT",  label: "Ethereum", short: "ETH",  color: "#3b82f6" },
  { value: "SOLUSDT",  label: "Solana",   short: "SOL",  color: "#9333ea" },
  { value: "BNBUSDT",  label: "BNB",      short: "BNB",  color: "#F3BA2F" },
  { value: "PEPEUSDT", label: "Pepe",     short: "PEPE", color: "#4CAF50" },
  { value: "DOGEUSDT", label: "Dogecoin", short: "DOGE", color: "#C2A633" },
];

const DURATIONS = [5, 15, 30, 60, 240, 1440];

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${min / 60}h`;
  return "24h";
}

function formatPrice(p: number): string {
  if (p >= 1000)   return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (p >= 1)      return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (p >= 0.01)   return "$" + p.toFixed(4);
  if (p >= 0.0001) return "$" + p.toFixed(6);
  return "$" + p.toFixed(8);
}

function useCountdown(closeAt: string | null | undefined): string {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!closeAt) return;
    const target = new Date(closeAt).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setRemaining("00:00"); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [closeAt]);
  return remaining;
}

// Card pour un seul round (une durée)
function DurationCard({ market, symColor, symLabel }: {
  market: UpDownMarket | undefined;
  symColor: string;
  symLabel: string;
}) {
  const countdown = useCountdown(market?.status === "open" ? market.closes_at : null);
  const fakeBets  = useFakeLiveBets(2, !(Number(market?.pool_up ?? 0) + Number(market?.pool_down ?? 0) > 0));

  if (!market) {
    return (
      <div className="overflow-hidden rounded-[22px] border border-dashed border-border bg-card">
        <div className="flex h-full min-h-[200px] items-center justify-center p-5">
          <p className="text-xs text-muted-foreground">Round pending...</p>
        </div>
      </div>
    );
  }

  const poolUp   = Number(market.pool_up);
  const poolDown = Number(market.pool_down);
  const total    = poolUp + poolDown;
  const upPct    = total > 0 ? Math.round((poolUp / total) * 100) : 50;
  const isOpen   = market.status === "open";
  const isResolved = market.status === "resolved";

  return (
    <Link
      href={`/crypto/${market.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-[22px] border border-border bg-card transition-colors hover:border-primary/40"
    >
      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[16px] font-bold leading-snug tracking-tight text-foreground">
              {symLabel} · Up/Down
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="num text-[13px] font-semibold text-muted-foreground">
                Strike {formatPrice(market.strike_price)}
              </span>
              {isResolved && market.outcome && (
                <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  market.outcome === "up"
                    ? "bg-up/12 text-up"
                    : "bg-down/12 text-down"
                }`}>
                  {market.outcome === "up" ? "↑ UP" : "↓ DOWN"}
                </span>
              )}
            </div>
          </div>
          {/* Countdown */}
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
            <Clock className="size-3 text-muted-foreground" />
            <span className="num text-xs font-bold text-foreground">
              {isOpen ? countdown : formatDuration(market.duration_min)}
            </span>
          </div>
        </div>

        {/* Pool bar */}
        <div>
          <div className="h-2 gap-0.5 rounded-full bg-muted overflow-hidden flex mb-1.5">
            <div className="rounded-full bg-up transition-all duration-500" style={{ width: `${upPct}%` }} />
            <div className="rounded-full bg-down flex-1" />
          </div>
          <div className="num flex justify-between text-xs text-muted-foreground">
            <span className="text-up font-bold">↑ {upPct}%</span>
            <span>{formatVolume(total, "usdc")}</span>
            <span className="text-down font-bold">{100 - upPct}% ↓</span>
          </div>
        </div>

        {/* UP / DOWN buttons — même style que options MarketCard */}
        <div className="grid grid-cols-2 gap-2">
          <div className="relative flex items-center justify-center gap-1 rounded-2xl bg-up/12 px-3 py-3.5 transition-colors group-hover:bg-up/18">
            <FakeBetOverlay optionIndex={0} bets={fakeBets} />
            <span className="text-sm font-bold text-up">↑ Up</span>
            {isResolved && market.outcome === "up" && <span className="text-xs font-bold text-up">✓</span>}
          </div>
          <div className="relative flex items-center justify-center gap-1 rounded-2xl bg-down/12 px-3 py-3.5 transition-colors group-hover:bg-down/18">
            <FakeBetOverlay optionIndex={1} bets={fakeBets} />
            <span className="text-sm font-bold text-down">↓ Down</span>
            {isResolved && market.outcome === "down" && <span className="text-xs font-bold text-red-500">✓</span>}
          </div>
        </div>

        {/* Footer */}
        <div className="num mt-auto flex items-center justify-between border-t border-border pt-3 text-[13px] font-medium text-muted-foreground">
          <span>{formatDuration(market.duration_min)} · {market.fee_rate}% fee</span>
          {isResolved && market.open_price && (
            <span className={`font-semibold ${Number(market.open_price) > market.strike_price ? "text-up" : "text-down"}`}>
              Close {formatPrice(Number(market.open_price))}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Export principal ───────────────────────────────────────────────────────────

export function UpDownCards() {
  const [activeSymbol, setActiveSymbol] = useState("BTCUSDT");
  const [markets, setMarkets] = useState<Record<number, UpDownMarket | undefined>>({});
  const [loading, setLoading] = useState(true);

  const fetchMarkets = useCallback(async () => {
    const res = await fetch(`/api/updown/markets?symbol=${activeSymbol}`);
    if (res.ok) {
      const d = await res.json() as { markets?: Record<string, { open?: UpDownMarket; resolved?: UpDownMarket }> };
      const result: Record<number, UpDownMarket> = {};
      for (const [k, slot] of Object.entries(d.markets ?? {})) {
        const m = slot.open ?? slot.resolved;
        if (m) result[Number(k)] = m;
      }
      setMarkets(result);
    }
    setLoading(false);
  }, [activeSymbol]);

  useEffect(() => {
    setLoading(true);
    void fetchMarkets();
    // Poll every 30s to pick up new rounds after resolution
    const id = setInterval(() => { void fetchMarkets(); }, 30_000);
    return () => clearInterval(id);
  }, [activeSymbol, fetchMarkets]);

  const sym = SYMBOLS.find(s => s.value === activeSymbol) ?? SYMBOLS[0];

  return (
    <>
      {/* Symbol selector — ligne horizontale compacte AU-DESSUS des cards, pas dans la grille */}
      <div className="col-span-full flex flex-wrap items-center gap-2 mb-1">
        <span className="text-lg font-bold tracking-tight text-foreground mr-2">Up/Down</span>
        {SYMBOLS.map(s => (
          <button
            key={s.value}
            type="button"
            onClick={() => setActiveSymbol(s.value)}
            className="rounded-xl px-3.5 py-1.5 text-sm font-bold transition-colors"
            style={
              activeSymbol === s.value
                ? { background: s.color, color: "#fff" }
                : { border: "1px solid var(--border)", color: "var(--muted-foreground)", background: "transparent" }
            }
          >
            {s.short}
          </button>
        ))}
      </div>

      {/* 6 cards — une par durée */}
      {loading ? (
        Array.from({ length: DURATIONS.length }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-[22px] border border-border bg-card animate-pulse">
            <div className="flex h-[200px] items-center justify-center">
              <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
            </div>
          </div>
        ))
      ) : (
        DURATIONS.map(d => (
          <DurationCard
            key={d}
            market={markets[d]}
            symColor={sym.color}
            symLabel={sym.label}
          />
        ))
      )}
    </>
  );
}
