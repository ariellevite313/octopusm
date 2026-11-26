"use client";

/**
 * « Tokens en tendance » du fil (ordinateur) : ClawdTrust, Solana, tokens boostés en Omero, derniers lancements OM,
 * puis les tokens avec le plus de volume et d'engagement. Le bouton Boost met n'importe quel token du Terminal ici.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { useT } from "@/lib/i18n";
import { BoostTokenSheet, FEED_TOKENS_REFRESH } from "@/components/social/boost-token-sheet";
import type { FeedToken } from "@/app/api/feed/tokens/route";

function cap(n: number | null): string {
  if (n == null) return "";
  return n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
}

export function FeedTokens({ className = "" }: { className?: string }) {
  const { tr } = useT();
  const [rows, setRows] = useState<FeedToken[] | null>(null);
  const [boost, setBoost] = useState(false);

  useEffect(() => {
    let off = false;
    const load = () => fetch("/api/feed/tokens", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (!off) setRows(j.tokens ?? []); }).catch(() => { if (!off) setRows((r) => r ?? []); });
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60_000);
    window.addEventListener(FEED_TOKENS_REFRESH, load);
    return () => { off = true; clearInterval(id); window.removeEventListener(FEED_TOKENS_REFRESH, load); };
  }, []);

  return (
    <section className={`overflow-hidden rounded-2xl border border-border ${className}`}>
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <h2 className="text-xl font-extrabold tracking-tight">{tr("Trending tokens")}</h2>
        <button onClick={() => setBoost(true)} className="flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-bold text-background hover:opacity-90">
          <Rocket className="size-4" />{tr("Boost")}
        </button>
      </div>
      {rows === null ? (
        <div className="space-y-3 p-4">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-muted/50" />)}</div>
      ) : rows.length === 0 ? (
        <p className="px-4 pb-4 pt-1 text-sm text-muted-foreground">{tr("Nothing trending yet.")}</p>
      ) : rows.map((t) => (
        <Link key={`${t.chain}:${t.mint}`} href={t.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
          <span className="relative shrink-0">
            {t.logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={t.logo} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="size-10 rounded-full bg-muted object-cover" />
              : <span className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-bold">{t.symbol.slice(0, 1)}</span>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/chains/${t.chain}.png`} alt="" className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full object-cover ring-2 ring-background" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-bold">${t.symbol}</span>
              {t.tag === "boosted" && <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-up"><Rocket className="size-3" />{tr("Boosted")}</span>}
              {t.tag === "new" && <span className="shrink-0 text-[11px] font-bold text-muted-foreground">{tr("New on OM")}</span>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{t.name}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="num block text-[14px] font-semibold">{cap(t.mcap)}</span>
            {t.change24h != null && <span className={`num block text-[12px] font-semibold ${t.change24h >= 0 ? "text-up" : "text-down"}`}>{t.change24h >= 0 ? "+" : ""}{t.change24h.toFixed(1)}%</span>}
          </span>
        </Link>
      ))}
      {boost && <BoostTokenSheet onClose={() => setBoost(false)} />}
    </section>
  );
}
