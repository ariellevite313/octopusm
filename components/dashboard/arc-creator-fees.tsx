"use client";

/**
 * ArcCreatorFees — V2
 *
 * Liste les tokens Arc V2 créés par l'utilisateur et affiche les USDC creator fees claimables.
 *
 * arc_launch_id = adresse du BondingCurveArcV2 (clone standalone) ≠ mint_address
 * Tokens V4 legacy (arc_launch_id === mint_address) ignorés — coupure propre V2.
 *
 * Lit  : BondingCurveArcV2.creatorAccrued()       — USDC natif Arc 18 dec
 * Claim: BondingCurveArcV2.claimCreatorFees(to)   — envoie l'ETH natif au créateur
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import { Loader2, CheckCircle2 } from "lucide-react";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { useAuth } from "@/providers/auth-provider";
import { getProviderByType } from "@/lib/wallet/adapters";
import { BONDING_CURVE_V2_ABI } from "@/lib/arc-launchpad";
import { arc } from "@/lib/arc-chain";

function fmtUsdc(raw: bigint): string {
  const n = Number(raw) / 1e18; // USDC natif Arc = 18 dec
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

type ArcToken = {
  id: string;
  name: string;
  ticker: string;
  logo_url: string | null;
  arc_launch_id: string | null;
  mint_address:  string | null;
};

type TokenWithFees = ArcToken & {
  curveAddress: string;
  accrued:      bigint | null; // null = loading
  claiming:     boolean;
  txHash:       string | null;
  error:        string | null;
};

export function ArcCreatorFees() {
  const { walletAddress, walletType, selectedChain, isAuthenticated } = useAuth();
  const [tokens, setTokens] = useState<TokenWithFees[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Fetch Arc tokens from DB
  useEffect(() => {
    if (!isAuthenticated) return;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/launchpad/mine");
        if (!res.ok) return;
        const all = await res.json() as ArcToken[];

        // V2 uniquement : arc_launch_id valide et ≠ mint_address (curve ≠ token)
        const v2Tokens = all.filter(t => {
          if (!t.arc_launch_id?.startsWith("0x") || t.arc_launch_id.length !== 42) return false;
          // Ignorer les V4 legacy où arc_launch_id === mint_address
          if (
            t.mint_address &&
            t.arc_launch_id.toLowerCase() === t.mint_address.toLowerCase()
          ) return false;
          return true;
        });

        setTokens(v2Tokens.map(t => ({
          ...t,
          curveAddress: t.arc_launch_id!,
          accrued: null,
          claiming: false,
          txHash: null,
          error: null,
        })));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [isAuthenticated]);

  // 2. Read creatorAccrued for each V2 token
  useEffect(() => {
    if (tokens.length === 0) return;
    const client = createPublicClient({ chain: arc, transport: http("/api/arc-rpc") });

    tokens.forEach(async (token, idx) => {
      try {
        const raw = await client.readContract({
          address:      token.curveAddress as `0x${string}`,
          abi:          BONDING_CURVE_V2_ABI,
          functionName: "creatorAccrued",
        }) as bigint;
        setTokens(prev => prev.map((t, i) => i === idx ? { ...t, accrued: raw } : t));
      } catch {
        setTokens(prev => prev.map((t, i) => i === idx ? { ...t, accrued: 0n } : t));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens.length]);

  // 3. Claim creator fees
  async function handleClaim(idx: number) {
    if (!walletAddress || !walletType) return;
    const provider = getProviderByType(walletType);
    if (!provider?.request) return;

    const token = tokens[idx];
    if (!token.accrued || token.accrued === 0n) return;
    const accruedAmount = token.accrued; // capture before reset

    setTokens(prev => prev.map((t, i) => i === idx ? { ...t, claiming: true, error: null } : t));

    try {
      const walletClient = createWalletClient({ chain: arc, transport: custom(provider) });
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${arc.id.toString(16)}` }],
        });
      } catch { /* ignore */ }

      const [account] = await walletClient.getAddresses();

      const hash = await walletClient.writeContract({
        address:      token.curveAddress as `0x${string}`,
        abi:          BONDING_CURVE_V2_ABI,
        functionName: "claimCreatorFees",
        args:         [account],
        account,
        chain:        arc,
      });

      setTokens(prev => prev.map((t, i) =>
        i === idx ? { ...t, claiming: false, txHash: hash, accrued: 0n } : t
      ));

      // Log to DB so "Total Claimed" banner updates
      fetch("/api/dashboard/log-claim", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId:      token.id,
          walletAddress: account,
          amountSol:    0,
          amountUsdc:   Number(accruedAmount) / 1e18,
          txSignature:  hash,
          chain:        "arc",
        }),
      }).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setTokens(prev => prev.map((t, i) =>
        i === idx
          ? { ...t, claiming: false, error: msg.length > 80 ? msg.slice(0, 80) + "…" : msg }
          : t
      ));
    }
  }

  if (!isAuthenticated) return null;

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Loading Arc tokens…
    </div>
  );

  if (tokens.length === 0) return (
    <p className="text-sm text-muted-foreground py-2">No Arc V2 tokens launched yet.</p>
  );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Arc tokens — creator fees</h3>
      {tokens.map((token, idx) => (
        <div
          key={token.id}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
        >
          {/* Logo */}
          <div className="size-10 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
            {token.logo_url
              ? (
                <Image
                  src={token.logo_url}
                  alt={token.name}
                  width={40}
                  height={40}
                  className="object-cover"
                  unoptimized
                />
              )
              : (
                <span className="text-xs font-bold text-muted-foreground">
                  {token.ticker.slice(0, 2)}
                </span>
              )}
          </div>

          {/* Name + fees */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {token.name}
            </p>

            <p className="text-xs text-muted-foreground">
              {token.accrued === null
                ? "Reading…"
                : token.accrued === 0n
                ? "No creator fees yet"
                : `${fmtUsdc(token.accrued)} USDC claimable`}
            </p>

            {token.txHash && (
              <a
                href={`https://explorer.arc.io/tx/${token.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline mt-0.5"
              >
                <CheckCircle2 className="size-3" /> Claimed
              </a>
            )}
            {token.error && (
              <p className="text-[11px] text-red-400 mt-0.5">{token.error}</p>
            )}
          </div>

          {/* Claim button — only shown when connected on Arc AND fees are available */}
          {selectedChain !== "arc" ? (
            <span className="text-[10px] text-muted-foreground text-right shrink-0">
              Connect<br />MetaMask
            </span>
          ) : token.accrued === null ? (
            /* Still loading */
            <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
          ) : token.accrued === 0n ? (
            /* No fees — show nothing (dash) to avoid a confusing disabled button */
            <span className="text-xs text-muted-foreground shrink-0">—</span>
          ) : (
            /* Fees available → active Claim button */
            <button
              onClick={() => void handleClaim(idx)}
              disabled={token.claiming}
              className="rounded-full px-4 py-2 text-xs font-semibold transition-colors shrink-0 bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-60"
            >
              {token.claiming
                ? <Loader2 className="size-3.5 animate-spin" />
                : "Claim"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
