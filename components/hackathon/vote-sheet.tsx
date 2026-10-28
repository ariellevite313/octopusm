"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { getXStockMint } from "@/lib/solana/xstocks";
import type { BoardRow } from "@/lib/hackathon/leaderboard";
import type { MyVotes } from "@/lib/hackathon/my-votes";
import { usd2 } from "./use-hackathon";

const TokenSwapDBC = dynamic(() => import("@/components/launchpad/token-swap-dbc").then((m) => m.TokenSwapDBC), { ssr: false });
const TokenSwapArc = dynamic(() => import("@/components/launchpad/token-swap-arc").then((m) => m.TokenSwapArc), { ssr: false });
const TokenSwapJupiter = dynamic(() => import("@/components/launchpad/token-swap-jupiter").then((m) => m.TokenSwapJupiter), { ssr: false });

/** Voter = acheter le token du projet sur OM : 1 $ investi = 1 vote. */
export function VoteSheet({ row, onClose }: { row: BoardRow; onClose: () => void }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const t = row.trade;
  const [done, setDone] = useState(false);
  const [mine, setMine] = useState<{ votes: number; total: number; rank: number; gain: number } | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k); };
  }, [onClose]);

  // Une fois l'achat lu par le serveur, on affiche la confirmation avec les votes à jour
  useEffect(() => {
    const onRecorded = (e: Event) => {
      const mint = (e as CustomEvent<{ mint?: string }>).detail?.mint;
      if (mint && t.mint_address && mint.toLowerCase() !== t.mint_address.toLowerCase()) return;
      setDone(true);
      // Les trades Arc sont lus par le cron : quelques essais
      let n = 0;
      const poll = () => {
        fetch("/api/hackathon/my-votes", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d: MyVotes | null) => {
          const it = d?.items.find((i) => i.projectId === row.projectId);
          if (it) setMine({ votes: it.votes, total: d!.totalVotes, rank: it.rank, gain: it.estimatedGainUsd });
          else if (++n < 6) setTimeout(poll, 5000);
        }).catch(() => {});
      };
      poll();
    };
    window.addEventListener("om-trade-recorded", onRecorded);
    return () => window.removeEventListener("om-trade-recorded", onRecorded);
  }, [row.projectId, t.mint_address]);

  const graduated = t.status === "graduated";
  const canSol = t.chain === "solana" && t.pool_address && t.mint_address;
  const canArc = t.chain === "arc" && t.arc_launch_id && t.mint_address;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-card p-5 sm:rounded-[28px]">
        <div className="mb-3 flex items-center gap-3">
          {t.logo_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.logo_url} alt="" className="size-11 rounded-xl object-cover" /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-foreground">{tr("Vote for {name}", { name: row.name })}</p>
            <p className="text-[13px] text-muted-foreground">{tr("$1 invested = 1 vote")}</p>
          </div>
          <button onClick={onClose} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><X className="size-5" /></button>
        </div>

        {done ? (
          <div className="py-4">
            <p className="text-[15px] text-muted-foreground">{tr("Your purchase is recorded.")}</p>
            {mine ? (
              <>
                <p className="num mt-2 text-[40px] font-bold leading-none text-foreground">{Math.round(mine.votes)} {tr("votes")}</p>
                <p className="mt-2 text-[15px] text-muted-foreground">{tr("on {name} · rank {rank}", { name: row.name, rank: mine.rank })}</p>
                <p className="mt-1 text-[15px] text-muted-foreground">{tr("{total} votes in total · estimated gain {gain}", { total: Math.round(mine.total), gain: usd2(mine.gain) })}</p>
              </>
            ) : (
              <p className="mt-2 text-[15px] text-muted-foreground">{tr("Your votes are updating. This can take a minute.")}</p>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => { setDone(false); setMine(null); }} className="flex h-12 items-center justify-center rounded-2xl bg-muted text-[15px] font-bold text-foreground hover:bg-muted/70">{tr("Add votes")}</button>
              <Link href="/hackathon/classement" onClick={onClose} className="flex h-12 items-center justify-center rounded-2xl bg-foreground text-[15px] font-bold text-background">{tr("See the leaderboard")}</Link>
            </div>
          </div>
        ) : !isAuthenticated ? (
          <button onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} className="btn-primary flex h-12 w-full items-center justify-center rounded-2xl text-[15px]">{tr("Connect Wallet")}</button>
        ) : graduated && t.mint_address ? (
          <TokenSwapJupiter mintAddress={t.mint_address} />
        ) : canSol ? (
          <TokenSwapDBC poolAddress={t.pool_address!} mintAddress={t.mint_address!} ticker={t.ticker} logoUrl={t.logo_url ?? undefined}
            stockSymbol={t.stock_symbol ?? undefined} quoteMintAddress={t.stock_symbol ? getXStockMint(t.stock_symbol) ?? undefined : undefined} />
        ) : canArc ? (
          <TokenSwapArc launchId={t.arc_launch_id!} tokenAddress={t.mint_address!} ticker={t.ticker} logoUrl={t.logo_url ?? undefined} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">{tr("Trading is not available for this token yet.")}</p>
        )}
        <p className="mt-4 text-[12px] text-muted-foreground">{tr("Only purchases made on OM count. If you sell, your votes go down in the same proportion.")}</p>
      </div>
    </div>
  );
}
