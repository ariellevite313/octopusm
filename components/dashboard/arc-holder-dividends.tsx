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
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
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

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">
        Arc tokens — dividendes holders
      </h3>

      {visible.map(token => (
        <div
          key={token.id}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
        >
          {/* Logo */}
          <div className="size-10 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
            {token.logo_url ? (
              <Image
                src={token.logo_url}
                alt={token.name}
                width={40}
                height={40}
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="text-xs font-bold text-muted-foreground">
                {token.ticker.slice(0, 2)}
              </span>
            )}
          </div>

          {/* Infos */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {token.name}
              <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                ${token.ticker}
              </span>
            </p>

            <p className="text-xs text-muted-foreground">
              {token.pending === null
                ? "Lecture…"
                : token.pending === 0n
                ? "Aucun dividende à réclamer"
                : `${fmtUsdc(token.pending)} USDC claimable`}
            </p>

            {token.txHash && (
              <a
                href={`https://explorer.arc.io/tx/${token.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline mt-0.5"
              >
                <CheckCircle2 className="size-3" /> Réclamé
              </a>
            )}
            {token.error && (
              <p className="text-[11px] text-red-400 mt-0.5">{token.error}</p>
            )}
          </div>

          {/* Bouton claim */}
          {selectedChain !== "arc" ? (
            <span className="text-[10px] text-muted-foreground text-right shrink-0">
              Connecte<br />MetaMask
            </span>
          ) : (
            <button
              onClick={() => void handleClaim(token.id)}
              disabled={token.claiming || !token.pending || token.pending === 0n}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors shrink-0 ${
                token.claiming || !token.pending || token.pending === 0n
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-purple-500 hover:bg-purple-400 text-white"
              }`}
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
