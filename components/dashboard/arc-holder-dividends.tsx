"use client";

/**
 * ArcHolderDividends — V2
 *
 * Affiche les dividendes OMToken claimables pour le wallet connecté.
 * Fonctionne pour les tiers Community (1) et Max (3) qui allouent un holdersBps > 0.
 *
 * Lit  : OMToken.pendingDividend(wallet)  — USDC natif Arc 18 dec
 * Claim: OMToken.claimDividend()          — envoie l'ETH natif au holder
 *
 * NB: seul msg.sender peut claim, pas de paramètre "to".
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import { Loader2, CheckCircle2 } from "lucide-react";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { useAuth } from "@/providers/auth-provider";
import { getProviderByType } from "@/lib/wallet/adapters";
import { OM_TOKEN_ABI } from "@/lib/arc-launchpad";
import { arc } from "@/lib/arc-chain";

function fmtUsdc(raw: bigint): string {
  const n = Number(raw) / 1e18;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

type ArcToken = {
  id:            string;
  name:          string;
  ticker:        string;
  logo_url:      string | null;
  mint_address:  string | null; // OMToken ERC-20 address
  arc_launch_id: string | null; // BondingCurveArcV2 address
};

type TokenWithDividend = ArcToken & {
  tokenAddress: string; // = mint_address (OMToken)
  pending:      bigint | null; // null = en cours de lecture
  claiming:     boolean;
  txHash:       string | null;
  error:        string | null;
};

export function ArcHolderDividends() {
  const { walletAddress, walletType, selectedChain, isAuthenticated } = useAuth();
  const [tokens,  setTokens]  = useState<TokenWithDividend[]>([]);
  const [loading, setLoading] = useState(true);

  // ── 1. Charger tous les tokens Arc V2 de la plateforme ────────────────────
  useEffect(() => {
    if (!isAuthenticated || !walletAddress) return;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/launchpad/tokens?chain=arc&limit=100&sort=new");
        if (!res.ok) return;
        const data = await res.json() as { tokens: ArcToken[] };

        // V2 uniquement : arc_launch_id valide ≠ mint_address (curve ≠ token)
        const v2 = (data.tokens ?? []).filter(t => {
          if (!t.arc_launch_id?.startsWith("0x") || t.arc_launch_id.length !== 42) return false;
          if (!t.mint_address?.startsWith("0x")  || t.mint_address.length  !== 42) return false;
          if (t.arc_launch_id.toLowerCase() === t.mint_address.toLowerCase()) return false;
          return true;
        });

        setTokens(v2.map(t => ({
          ...t,
          tokenAddress: t.mint_address!,
          pending:  null,
          claiming: false,
          txHash:   null,
          error:    null,
        })));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [isAuthenticated, walletAddress]);

  // ── 2. Lire pendingDividend(wallet) pour chaque token ─────────────────────
  useEffect(() => {
    if (tokens.length === 0 || !walletAddress) return;
    const client = createPublicClient({ chain: arc, transport: http("/api/arc-rpc") });

    tokens.forEach(async (token) => {
      try {
        const raw = await client.readContract({
          address:      token.tokenAddress as `0x${string}`,
          abi:          OM_TOKEN_ABI,
          functionName: "pendingDividend",
          args:         [walletAddress as `0x${string}`],
        }) as bigint;
        setTokens(prev =>
          prev.map(t => t.id === token.id ? { ...t, pending: raw } : t)
        );
      } catch {
        setTokens(prev =>
          prev.map(t => t.id === token.id ? { ...t, pending: 0n } : t)
        );
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens.length, walletAddress]);

  // ── 3. Claim ──────────────────────────────────────────────────────────────
  async function handleClaim(tokenId: string) {
    if (!walletAddress || !walletType) return;
    const provider = getProviderByType(walletType);
    if (!provider?.request) return;

    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, claiming: true, error: null } : t
    ));

    try {
      const walletClient = createWalletClient({ chain: arc, transport: custom(provider) });
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${arc.id.toString(16)}` }],
        });
      } catch { /* ignore */ }

      const [account] = await walletClient.getAddresses();
      const token = tokens.find(t => t.id === tokenId)!;

      const hash = await walletClient.writeContract({
        address:      token.tokenAddress as `0x${string}`,
        abi:          OM_TOKEN_ABI,
        functionName: "claimDividend",
        args:         [],
        account,
        chain:        arc,
      });

      setTokens(prev => prev.map(t =>
        t.id === tokenId ? { ...t, claiming: false, txHash: hash, pending: 0n } : t
      ));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setTokens(prev => prev.map(t =>
        t.id === tokenId
          ? { ...t, claiming: false, error: msg.length > 80 ? msg.slice(0, 80) + "…" : msg }
          : t
      ));
    }
  }

  if (!isAuthenticated) return null;

  // Afficher seulement les tokens avec dividende > 0 (ou en chargement ou déjà claimé)
  const visible = tokens.filter(t => t.pending === null || t.pending > 0n || t.txHash);

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Lecture des dividendes…
    </div>
  );

  // Si tous les tokens ont été lus et aucun dividende : ne rien afficher
  if (!loading && visible.length === 0) return null;

  // Total claimable (somme des pending > 0)
  const totalPending = tokens.reduce((acc, t) => acc + (t.pending ?? 0n), 0n);

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Arc · Dividendes
        </h3>
        {totalPending > 0n && (
          <span className="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-orange-500">
            {fmtUsdc(totalPending)} USDC
          </span>
        )}
      </div>

      {visible.map(token => {
        const hasBalance = token.pending !== null && token.pending > 0n;
        const isLoading  = token.pending === null;
        const isClaimed  = !!token.txHash;

        return (
          <div
            key={token.id}
            className={`flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 transition-opacity ${
              isClaimed ? "opacity-50" : "opacity-100"
            } ${hasBalance ? "border-orange-500/30" : "border-border"}`}
          >
            {/* Logo */}
            <div className="size-[42px] shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
              {token.logo_url ? (
                <Image
                  src={token.logo_url}
                  alt={token.name}
                  width={42}
                  height={42}
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-xs font-bold text-muted-foreground">
                  {token.ticker.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            {/* Infos */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[13px] font-medium text-foreground truncate">
                  {token.name}
                </p>
                <span className="text-[11px] text-muted-foreground">${token.ticker}</span>
                <span className="rounded bg-blue-700 px-1 py-px text-[9px] font-bold tracking-wide text-blue-200">
                  ARC
                </span>
              </div>

              {isLoading ? (
                <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin text-orange-500" />
                  Lecture…
                </div>
              ) : (
                <p className={`mt-0.5 text-[12px] ${hasBalance ? "font-semibold text-orange-500" : "text-muted-foreground"}`}>
                  {hasBalance
                    ? `${fmtUsdc(token.pending!)} USDC claimable`
                    : isClaimed
                    ? "0.00 USDC"
                    : "Aucun dividende"}
                </p>
              )}

              {isClaimed && (
                <a
                  href={`https://explorer.arc.io/tx/${token.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                >
                  <CheckCircle2 className="size-3" /> Réclamé · voir sur explorer
                </a>
              )}
              {token.error && (
                <p className="mt-0.5 text-[11px] text-red-400">{token.error}</p>
              )}
            </div>

            {/* Bouton claim */}
            {selectedChain !== "arc" ? (
              <span className="shrink-0 text-right text-[10px] text-muted-foreground">
                Connecte<br />MetaMask
              </span>
            ) : isLoading ? (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Loader2 className="size-3.5 animate-spin text-orange-500" />
              </div>
            ) : (
              <button
                onClick={() => void handleClaim(token.id)}
                disabled={token.claiming || !hasBalance}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                  hasBalance && !token.claiming
                    ? "bg-orange-500 text-white active:bg-orange-600"
                    : "cursor-not-allowed bg-muted text-muted-foreground"
                }`}
              >
                {token.claiming
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : "Claim"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
