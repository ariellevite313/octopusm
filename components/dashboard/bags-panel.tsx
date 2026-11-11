"use client";

/** BAGS : tous les tokens du portefeuille connecté, du plus gros au plus petit (lecture seule). */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { Bag } from "@/lib/bags";

type Data = { chain: "solana" | "arc"; main: Bag[]; small: Bag[]; total: number };

function usd(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  return "<$0.01";
}
function qty(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(2).replace(/\.?0+$/, "");
  return n.toPrecision(3);
}
function price(n: number): string {
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 0.0001) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(2)}`;
}

export function BagsPanel() {
  const { tr } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSmall, setShowSmall] = useState(false);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(false);
    try {
      const r = await fetch(`/api/bags${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      setData((await r.json()) as Data);
    } catch { setError(true); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[28px] font-bold tracking-tight text-foreground">BAGS</h2>
          <p className="text-[15px] text-muted-foreground">
            {data ? `${data.chain === "arc" ? "Arc" : "Solana"} · ${tr("{count} tokens", { count: data.main.length + data.small.length })}` : " "}
          </p>
        </div>
        <button onClick={() => load(true)} disabled={loading} title={tr("Refresh")}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
          <RefreshCw className={`size-[18px] ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {data && (
        <p className="num mt-3 text-[40px] font-bold leading-none tracking-tight text-foreground">{usd(data.total)}</p>
      )}

      <div className="mt-4">
        {loading && !data ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{tr("Loading")}</div>
        ) : error && !data ? (
          <p className="py-6 text-sm text-muted-foreground">{tr("Could not read the wallet right now")}</p>
        ) : data && data.main.length + data.small.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">{tr("No token in this wallet yet.")}</p>
        ) : data && (
          <>
            {data.main.map((b) => <Row key={`${b.chain}:${b.id}`} b={b} />)}
            {data.small.length > 0 && (
              <>
                <button onClick={() => setShowSmall((v) => !v)}
                  className="mt-2 flex w-full items-center justify-between rounded-2xl bg-muted/50 px-4 py-3 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
                  <span>{tr("Small balances and unpriced ({count})", { count: data.small.length })}</span>
                  <ChevronDown className={`size-4 transition-transform ${showSmall ? "rotate-180" : ""}`} />
                </button>
                {showSmall && <div className="opacity-70">{data.small.map((b) => <Row key={`${b.chain}:${b.id}`} b={b} />)}</div>}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Row({ b }: { b: Bag }) {
  const inner = (
    <>
      {b.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.logo} alt="" loading="lazy" className="size-11 shrink-0 rounded-full bg-muted object-cover" />
      ) : (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">{b.symbol.slice(0, 1)}</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-bold text-foreground">{b.name}</p>
        <p className="num truncate text-[13px] text-muted-foreground">{qty(b.amount)} {b.symbol}{b.price != null ? ` · ${price(b.price)}` : ""}</p>
      </div>
      <p className="num shrink-0 text-[16px] font-bold text-foreground">{b.value != null ? usd(b.value) : "-"}</p>
    </>
  );
  const cls = "flex items-center gap-3 rounded-2xl px-1 py-2.5";
  return b.href ? <Link href={b.href} className={`${cls} hover:bg-muted/40`}>{inner}</Link> : <div className={cls}>{inner}</div>;
}
