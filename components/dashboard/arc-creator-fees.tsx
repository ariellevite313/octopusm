"use client";

/**
 * ArcCreatorFees
 *
 * Lists all Arc tokens created by the user and shows claimable USDC fees.
 *
 * V4 tokens  (arc_launch_id === mint_address) :
 *   - Lit  BondingCurveHook.getCurveState(poolId).creatorFeesAccrued
 *   - Claim BondingCurveHook.claimFees(poolKey, account)
 *
 * V1 tokens  (arc_launch_id = standalone BondingCurve clone) :
 *   - Lit  BondingCurve.creatorFeesAccrued()
 *   - Claim BondingCurve.claimFees(account)
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import { Loader2, CheckCircle2 } from "lucide-react";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { useAuth } from "@/providers/auth-provider";
import { getProviderByType } from "@/lib/wallet/adapters";
import {
  BONDING_CURVE_ABI,
  BONDING_CURVE_HOOK_ABI,
  ARC_HOOK_ADDRESS,
  getArcV4PoolKey,
  getArcV4PoolId,
} from "@/lib/arc-launchpad";
import { arc } from "@/lib/arc-chain";

// V1 = USDC ERC-20 à 6 décimales, V4 = USDC natif Arc à 18 décimales EVM
function fmtUsdc(raw: bigint, isV4: boolean): string {
  let n: number;
  if (isV4) {
    // Évite Number() sur de grands bigints : diviser d'abord en bigint
    const whole = raw / BigInt(1e12); // → 6 décimales restantes
    n = Number(whole) / 1e6;
  } else {
    n = Number(raw) / 1e6; // 6 décimales ERC-20
  }
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

type ArcToken = {
  id: string;
  name: string;
  ticker: string;
  logo_url: string | null;
  arc_launch_id: string | null;
  mint_address:  string | null; // V4 : même valeur que arc_launch_id
};

type TokenWithFees = ArcToken & {
  isV4:     boolean;
  accrued:  bigint | null; // null = loading
  claiming: boolean;
  txHash:   string | null;
  error:    string | null;
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
        // Keep only Arc tokens with a valid 0x address in arc_launch_id
        const arcTokens = all.filter(
          t => t.arc_launch_id?.startsWith("0x") && t.arc_launch_id.length === 42
        );
        setTokens(arcTokens.map(t => {
          const isV4 = !!(
            t.mint_address &&
            t.arc_launch_id?.toLowerCase() === t.mint_address.toLowerCase()
          );
          return { ...t, isV4, accrued: null, claiming: false, txHash: null, error: null };
        }));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [isAuthenticated]);

  // 2. Read creatorFeesAccrued for each token (V4 or V1)
  useEffect(() => {
    if (tokens.length === 0) return;
    const client = createPublicClient({ chain: arc, transport: http("/api/arc-rpc") });

    tokens.forEach(async (token, idx) => {
      if (!token.arc_launch_id) return;
      try {
        let raw: bigint;

        if (token.isV4 && token.mint_address) {
          // ── V4 : lire depuis le hook singleton ───────────────────────────────
          if (!ARC_HOOK_ADDRESS) { raw = 0n; }
          else {
            const poolId = getArcV4PoolId(token.mint_address as `0x${string}`);
            const state = await client.readContract({
              address:      ARC_HOOK_ADDRESS,
              abi:          BONDING_CURVE_HOOK_ABI,
              functionName: "getCurveState",
              args:         [poolId],
            }) as { creatorFeesAccrued: bigint };
            raw = state.creatorFeesAccrued;
          }
        } else {
          // ── V1 : lire depuis le clone BondingCurve ────────────────────────────
          raw = await client.readContract({
            address:      token.arc_launch_id as `0x${string}`,
            abi:          BONDING_CURVE_ABI,
            functionName: "creatorFeesAccrued",
          }) as bigint;
        }

        setTokens(prev => prev.map((t, i) => i === idx ? { ...t, accrued: raw } : t));
      } catch {
        setTokens(prev => prev.map((t, i) => i === idx ? { ...t, accrued: 0n } : t));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens.length]);

  // 3. Claim fees for one token
  async function handleClaim(idx: number) {
    if (!walletAddress || !walletType) return;
    const provider = getProviderByType(walletType);
    if (!provider?.request) return;

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
      const token = tokens[idx];
      let hash: `0x${string}`;

      if (token.isV4 && token.mint_address) {
        // ── V4 : hook.claimFees(poolKey, account) ────────────────────────────────
        if (!ARC_HOOK_ADDRESS) throw new Error("V4 hook not yet deployed");
        const poolKey = getArcV4PoolKey(token.mint_address as `0x${string}`);
        hash = await walletClient.writeContract({
          address:      ARC_HOOK_ADDRESS,
          abi:          BONDING_CURVE_HOOK_ABI,
          functionName: "claimFees",
          args:         [poolKey, account],
          account,
          chain:        arc,
        });
      } else {
        // ── V1 : BondingCurve.claimFees(account) ──────────────────────────────────
        hash = await walletClient.writeContract({
          address:      token.arc_launch_id as `0x${string}`,
          abi:          BONDING_CURVE_ABI,
          functionName: "claimFees",
          args:         [account],
          account,
          chain:        arc,
        });
      }

      setTokens(prev => prev.map((t, i) =>
        i === idx ? { ...t, claiming: false, txHash: hash, accrued: 0n } : t
      ));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setTokens(prev => prev.map((t, i) =>
        i === idx ? { ...t, claiming: false, error: msg.length > 80 ? msg.slice(0, 80) + "…" : msg } : t
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
    <p className="text-sm text-muted-foreground py-2">No Arc tokens launched yet.</p>
  );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Arc tokens — creator fees</h3>
      {tokens.map((token, idx) => (
        <div key={token.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          {/* Logo */}
          <div className="size-10 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
            {token.logo_url
              ? <Image src={token.logo_url} alt={token.name} width={40} height={40} className="object-cover" unoptimized />
              : <span className="text-xs font-bold text-muted-foreground">{token.ticker.slice(0, 2)}</span>
            }
          </div>

          {/* Name + accrued */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {token.name}
              {token.isV4 && (
                <span className="ml-1.5 text-[10px] font-medium text-orange-400/80 align-middle">V4</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {token.accrued === null
                ? "Reading…"
                : token.accrued === 0n
                ? "No fees yet"
                : `${fmtUsdc(token.accrued, token.isV4)} USDC claimable`}
            </p>
            {token.txHash && (
              <a
                href={`https://explorer.arc.io/tx/${token.txHash}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline mt-0.5"
              >
                <CheckCircle2 className="size-3" /> Claimed
              </a>
            )}
            {token.error && <p className="text-[11px] text-red-400 mt-0.5">{token.error}</p>}
          </div>

          {/* Claim button */}
          {selectedChain !== "arc" ? (
            <span className="text-[10px] text-muted-foreground text-right shrink-0">
              Connect<br />MetaMask
            </span>
          ) : (
            <button
              onClick={() => void handleClaim(idx)}
              disabled={token.claiming || !token.accrued || token.accrued === 0n}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors shrink-0 ${
                token.claiming || !token.accrued || token.accrued === 0n
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-orange-500 hover:bg-orange-400 text-white"
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
