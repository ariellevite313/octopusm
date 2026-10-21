"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { getXStockMint } from "@/lib/solana/xstocks";
import type { TokenCard } from "@/lib/social/token-card";

const TokenSwapDBC = dynamic(() => import("@/components/launchpad/token-swap-dbc").then((m) => m.TokenSwapDBC), { ssr: false });
const TokenSwapArc = dynamic(() => import("@/components/launchpad/token-swap-arc").then((m) => m.TokenSwapArc), { ssr: false });

/** Fenêtre d'achat / vente d'un token OMdotfun depuis le fil (même widget que la page du token). */
export function TradeSheet({ token, onClose, postId }: { token: TokenCard["token"]; onClose: () => void; postId?: string }) {
  const { tr } = useT();
  const { walletAddress } = useAuth();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k); };
  }, [onClose]);

  // Le trade vient d'un post : on retient ce post pour l'auteur (gain sur les achats qui suivent)
  useEffect(() => {
    if (postId && walletAddress) void fetch("/api/social/trade-attribution", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId }) }).catch(() => {});
  }, [postId, walletAddress]);

  const href = `/launchpad/${token.mint_address ?? token.id}`;
  const graduated = token.status === "graduated";
  const canSol = token.chain === "solana" && token.pool_address && token.mint_address;
  const canArc = token.chain === "arc" && token.arc_launch_id && token.mint_address;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-card p-5 sm:rounded-[28px]">
        <div className="mb-3 flex items-center gap-3">
          {token.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={token.logo_url} alt="" className="size-10 rounded-full object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-foreground">{tr("Trade")} ${token.ticker}</p>
            <Link href={href} onClick={onClose} className="text-xs font-semibold text-muted-foreground hover:text-foreground">{tr("Open token page")}</Link>
          </div>
          <button onClick={onClose} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><X className="size-5" /></button>
        </div>
        {graduated ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{tr("This token has graduated. Trade it from its page.")}</p>
        ) : canSol ? (
          <TokenSwapDBC
            poolAddress={token.pool_address!}
            mintAddress={token.mint_address!}
            ticker={token.ticker}
            logoUrl={token.logo_url ?? undefined}
            stockSymbol={token.stock_symbol ?? undefined}
            quoteMintAddress={token.stock_symbol ? getXStockMint(token.stock_symbol) ?? undefined : undefined}
          />
        ) : canArc ? (
          <TokenSwapArc launchId={token.arc_launch_id!} tokenAddress={token.mint_address!} ticker={token.ticker} logoUrl={token.logo_url ?? undefined} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">{tr("Trading is not available for this token yet.")}</p>
        )}
      </div>
    </div>
  );
}
