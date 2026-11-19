"use client";

/**
 * Onglet « Prédire » d'un token dans le Terminal : le pool automatique du token (« $TOKEN atteindra X avant … ? »,
 * avec son logo, un nouveau palier à chaque résolution) et les autres prédictions sur ce token, avec les cartes de pool
 * du site. Un bouton permet d'en créer une, pré-remplie.
 */
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { CreatePoolModal } from "@/components/pools/create-pool-modal";
import { PoolGridCard } from "@/components/market/pool-grid-card";
import type { MutuelMarketRow } from "@/lib/supabase/types";

type Pool = MutuelMarketRow & { auto_target?: number | null; auto_level?: number | null };

const money = (n: number) => (n >= 1e9 ? `$${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${+(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);

/** Cible : environ 10 fois la capitalisation, arrondie au chiffre rond supérieur (1, 2 ou 5 × 10^n). 10 K$ → 100 K$, 70 K$ → 1 M$. */
function nextTarget(mcap: number | null): number {
  if (!mcap || mcap <= 0) return 1_000_000;
  const x = mcap * 10;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  return (m <= 1.0001 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** Date et heure locales au format d'un champ datetime-local, dans `days` jours. */
function localIn(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

export function TokenPredictions({ mint, symbol, mcap, logo, chain = "solana" }: { mint: string; symbol: string; mcap: number | null; logo: string | null; chain?: string }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [pools, setPools] = useState<Pool[] | null>(null);
  const [create, setCreate] = useState(false);
  const load = () => fetch(`/api/pools/by-token?chain=${chain}&mint=${encodeURIComponent(mint)}`).then((r) => r.json()).then((j) => setPools(j.pools ?? [])).catch(() => setPools([]));
  useEffect(() => { load(); }, [mint]); // eslint-disable-line react-hooks/exhaustive-deps

  const auto = pools?.find((p) => p.auto_target && p.status === "active") ?? null;
  const others = (pools ?? []).filter((p) => p.id !== auto?.id);
  const progress = auto?.auto_target && mcap ? Math.min(100, (mcap / Number(auto.auto_target)) * 100) : null;
  const target = nextTarget(mcap);
  const when = localIn(7);
  const whenLabel = new Date(when).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-3 pt-1">
      {pools === null && Array.from({ length: 2 }, (_, i) => <div key={i} className="h-48 animate-pulse rounded-[22px] bg-muted" />)}

      {auto && (
        <div>
          <PoolGridCard market={auto} />
          {progress != null && (
            <div className="mt-2 px-1">
              <div className="flex items-center justify-between text-[12px] font-semibold text-muted-foreground">
                <span>{tr("Level {n}", { n: auto.auto_level ?? 1 })}</span>
                <span className="num">{money(mcap ?? 0)} / {money(Number(auto.auto_target))}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
        </div>
      )}

      {others.map((p) => <PoolGridCard key={p.id} market={p} />)}

      {pools !== null && !auto && others.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">{tr("No prediction on this token yet. Be the first.")}</p>
      )}

      <button
        onClick={() => (isAuthenticated ? setCreate(true) : window.dispatchEvent(new CustomEvent("open-wallet-connect")))}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-muted text-[15px] font-semibold text-foreground hover:bg-muted/70">
        <Plus className="size-4" />{tr("Create a prediction on ${sym}", { sym: symbol })}
      </button>

      {create && (
        <CreatePoolModal
          onClose={() => setCreate(false)}
          onCreated={() => { setCreate(false); load(); }}
          initial={{
            title: `Will $${symbol} reach ${money(target)} market cap before ${whenLabel}?`,
            description: `Resolves Yes if the market cap of $${symbol} (${mint}) reaches ${money(target)} or more before the close date, based on DexScreener. Otherwise No.`,
            coverImage: logo,
            options: [{ label: "Yes" }, { label: "No" }],
            closesAt: when,
            category: "crypto",
            tokenMint: mint,
          }}
        />
      )}
    </div>
  );
}
