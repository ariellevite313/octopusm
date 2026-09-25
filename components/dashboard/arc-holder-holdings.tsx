"use client";

/**
 * ArcHolderHoldings
 *
 * Affiche les tokens Arc V2 détenus par le wallet connecté.
 * Source : /api/launchpad/my-holdings → table arc_holdings (indexée par cron).
 *
 * Pour chaque token : logo, nom, balance formatée, valeur estimée en USDC.
 */

import { useState, useEffect } from "react";
import Image                   from "next/image";
import Link                    from "next/link";
import { Loader2, ExternalLink } from "lucide-react";
import { useAuth }             from "@/providers/auth-provider";
import { useT }               from "@/lib/i18n";

function fmtBalance(raw: string): string {
  const n = Number(BigInt(raw)) / 1e18;
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtUsdc(n: number): string {
  if (n === 0) return "< $0.01";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(4)}`;
}

type Holding = {
  id:            string;
  name:          string;
  ticker:        string;
  logo_url:      string | null;
  mint_address:  string | null;
  arc_launch_id: string | null;
  price_usd:     number | null;
  status:        string;
  balance_raw:   string;
};

export function ArcHolderHoldings() {
  const { isAuthenticated } = useAuth();
  const { t } = useT();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/launchpad/my-holdings");
        if (!res.ok) return;
        const data = await res.json() as { holdings: Holding[] };
        setHoldings(data.holdings ?? []);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {t.loadingPositions}
    </div>
  );

  if (holdings.length === 0) return null;

  // Valeur totale du portefeuille
  const totalUsd = holdings.reduce((acc, h) => {
    const balance = Number(BigInt(h.balance_raw)) / 1e18;
    return acc + balance * (h.price_usd ?? 0);
  }, 0);

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t.myArcPositions}
        </h3>
        {totalUsd > 0 && (
          <span className="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-orange-500">
            {fmtUsdc(totalUsd)}
          </span>
        )}
      </div>

      {holdings.map(h => {
        const balance   = Number(BigInt(h.balance_raw)) / 1e18;
        const valueUsd  = balance * (h.price_usd ?? 0);
        const tokenHref = `/launchpad/${h.mint_address ?? h.arc_launch_id ?? h.id}`;

        return (
          <Link
            key={h.id}
            href={tokenHref}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-orange-500/20 hover:bg-muted/30"
          >
            {/* Logo */}
            <div className="size-[42px] shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
              {h.logo_url ? (
                <Image
                  src={h.logo_url}
                  alt={h.name}
                  width={42}
                  height={42}
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-xs font-bold text-muted-foreground">
                  {h.ticker.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            {/* Infos */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[13px] font-medium text-foreground truncate">{h.name}</p>
                <span className="text-[11px] text-muted-foreground">${h.ticker}</span>
                <span className="rounded bg-blue-700 px-1 py-px text-[9px] font-bold tracking-wide text-blue-200">
                  ARC
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {fmtBalance(h.balance_raw)} tokens
              </p>
            </div>

            {/* Valeur + lien */}
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="text-[13px] font-semibold text-foreground">
                {valueUsd > 0 ? fmtUsdc(valueUsd) : "—"}
              </span>
              <ExternalLink className="size-3 text-muted-foreground/40" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
