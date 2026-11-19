"use client";

/**
 * Onglet « Prédire » d'un token dans le Terminal : les prédictions (pools) sur ce token, et un bouton pour en créer une,
 * pré-remplie (« $TOKEN atteindra X de capitalisation avant … ? », Oui / Non). Le créateur peut tout modifier avant de valider.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { CreatePoolModal } from "@/components/pools/create-pool-modal";

type Pool = { id: string; slug: string; title: string; status: string; bet_token: string; betting_closes_at: string; total_pool_usdc: number; total_pool_clt: number; bet_count: number };

const money = (n: number) => (n >= 1e9 ? `$${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${+(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);

/** Prochaine cible ronde : environ 2 fois la capitalisation actuelle (1, 2 ou 5 × 10^n). */
function nextTarget(mcap: number | null): number {
  if (!mcap || mcap <= 0) return 1_000_000;
  const x = mcap * 2;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** Date et heure locales au format d'un champ datetime-local, dans `days` jours. */
function localIn(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

function left(iso: string, tr: ReturnType<typeof useT>["tr"]): string {
  const s = Math.round((Date.parse(iso) - Date.now()) / 1000);
  if (s <= 0) return tr("Closed");
  return s < 3600 ? tr("{n}m left", { n: Math.ceil(s / 60) }) : s < 86_400 ? tr("{n}h left", { n: Math.floor(s / 3600) }) : tr("{n}d left", { n: Math.floor(s / 86_400) });
}

export function TokenPredictions({ mint, symbol, mcap, logo }: { mint: string; symbol: string; mcap: number | null; logo: string | null }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [pools, setPools] = useState<Pool[] | null>(null);
  const [create, setCreate] = useState(false);
  const load = () => fetch(`/api/pools/by-token?mint=${encodeURIComponent(mint)}`).then((r) => r.json()).then((j) => setPools(j.pools ?? [])).catch(() => setPools([]));
  useEffect(() => { load(); }, [mint]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = nextTarget(mcap);
  const when = localIn(1);
  const whenLabel = new Date(when).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="pt-1">
      <button
        onClick={() => (isAuthenticated ? setCreate(true) : window.dispatchEvent(new CustomEvent("open-wallet-connect")))}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-3.5 text-[15px] font-bold text-background">
        <Plus className="size-4" />{tr("Create a prediction on ${sym}", { sym: symbol })}
      </button>
      <p className="mt-2 text-center text-[12px] text-muted-foreground">{tr("Example: will ${sym} reach {target} market cap before {when}?", { sym: symbol, target: money(target), when: whenLabel })}</p>

      <div className="mt-4">
        {pools === null ? Array.from({ length: 2 }, (_, i) => <div key={i} className="my-2 h-16 animate-pulse rounded-2xl bg-muted" />)
          : pools.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{tr("No prediction on this token yet. Be the first.")}</p>
          : pools.map((p) => {
            const pool = p.bet_token === "usdc" ? `${money(Number(p.total_pool_usdc))}` : `${Math.round(Number(p.total_pool_clt)).toLocaleString("en-US")} CLT`;
            return (
              <Link key={p.id} href={`/pools/${p.slug}`} className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-foreground">{p.title}</p>
                  <p className="text-[13px] text-muted-foreground">{p.status === "resolved" ? tr("Resolved") : left(p.betting_closes_at, tr)} · {tr("{n} predictions", { n: p.bet_count })}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-[15px] font-bold text-foreground">{pool}</p>
                  <p className="text-[12px] text-muted-foreground">{tr("pool")}</p>
                </div>
              </Link>
            );
          })}
      </div>

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
