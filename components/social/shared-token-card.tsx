"use client";

/**
 * Carte d'un token partagé par lien dans une publication (omdot.fun/share/token/<adresse> ou /terminal?mint=<adresse>).
 * Le token est pris à son adresse exacte (et non à son ticker, que plusieurs tokens peuvent porter) : prix, variation,
 * capitalisation et graphique réels, avec le logo choisi par OM. Un clic ouvre le token dans le Terminal.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { GT_NET, logoFor, type TerminalChain } from "@/lib/terminal";
import { TerminalLineChart } from "@/components/terminal/line-chart";
export { sharedTokenOf } from "@/lib/social/shared-token";

type Stats = { symbol?: string | null; name?: string | null; logo?: string | null; price: number | null; mcap: number | null; change24h: number | null; pool: string | null };

const money = (n: number | null) => n == null ? "-" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;
const price = (n: number | null) => n == null ? "-" : n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 2 : 4 })}` : `$${n.toPrecision(4)}`;

export function SharedTokenCard({ mint, chain }: { mint: string; chain: TerminalChain }) {
  const { tr } = useT();
  const [s, setS] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/terminal/stats?chain=${chain}&mint=${encodeURIComponent(mint)}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!live) return; if (j?.stats) setS(j.stats); else setFailed(true); }).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [mint, chain]);
  if (failed) return null;
  if (!s) return <div className="mt-3 h-40 animate-pulse rounded-2xl bg-muted/30" />;
  const logo = logoFor(mint, s.logo ?? null);
  const href = `/terminal?${chain !== "solana" ? `chain=${chain}&` : ""}mint=${mint}`;
  const up = (s.change24h ?? 0) >= 0;
  return (
    <div className="mt-3">
      <Link href={href} className="flex items-center gap-3">
        {logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logo} alt="" className="size-9 shrink-0 rounded-full bg-muted object-cover" />
          : <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">{(s.symbol ?? "?")[0]}</div>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-foreground">{s.symbol ?? tr("Token")}</p>
          <p className="truncate text-[13px] text-muted-foreground">{s.name ?? ""}{s.mcap ? ` · ${money(s.mcap)} ${tr("cap.")}` : ""}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-[17px] font-bold text-foreground">{price(s.price)}</p>
          {s.change24h != null && <p className={`num text-[13px] font-semibold ${up ? "text-up" : "text-down"}`}>{up ? "+" : "-"}{Math.abs(s.change24h).toFixed(2)}% 24h</p>}
        </div>
      </Link>
      {s.pool && <div className="mt-2"><TerminalLineChart pool={s.pool} range="1D" network={GT_NET[chain] ?? chain} heightClass="h-[150px]" fallbackPrice={s.price} /></div>}
    </div>
  );
}
