"use client";

/**
 * ArcHolderDividends
 *
 * Affiche les tokens Arc V4 de tier COMMUNITY ou MAX pour lesquels
 * le wallet connecté a des dividendes en attente, et permet de les claim.
 *
 * Mécanisme :
 *  - Les dividendes sont des frais holders collectés par le BondingCurveHook
 *    et transmis à l'OMToken via addDividend() à chaque swap.
 *  - Seuls les tiers COMMUNITY (1) et MAX (3) ont des dividendes holders.
 *  - Le holder claim via OMToken.claimDividend() — pull-based, nobody else can claim.
 *  - Le timer d'inactivité (lastInteraction) reset sur claim/vente/transfer-out.
 *    Recevoir passivement des tokens ne reset PAS le timer.
 *  - Après 2 ans d'inactivité, OMdotfun peut sweep les dividendes non-claimés.
 */

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Loader2, CheckCircle2, Clock, Coins } from "lucide-react";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { useAuth } from "@/providers/auth-provider";
import { getProviderByType } from "@/lib/wallet/adapters";
import {
  BONDING_CURVE_HOOK_ABI,
  OMTOKEN_ABI,
  ARC_HOOK_ADDRESS,
  ARC_HOOK_ADDRESS_LEGACY,
  getArcV4PoolId,
} from "@/lib/arc-launchpad";
import { arc } from "@/lib/arc-chain";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DUST = BigInt("1000000000000"); // 1e12 — seuil minimum (≈ 0.000001 USDC)
const ABANDON_DELAY_S = 730 * 24 * 3600; // 2 ans

function fmtUsdc(raw: bigint): string {
  const whole = raw / BigInt(1e12); // 18 dec → 6 dec
  const n = Number(whole) / 1e6;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function abandonLabel(lastInteraction: bigint, nowS: number): string {
  if (lastInteraction === 0n) return ""; // jamais interagi
  const elapsedS = nowS - Number(lastInteraction);
  const remainS  = ABANDON_DELAY_S - elapsedS;
  if (remainS <= 0) return "⚠ OMdotfun can sweep";
  const days = Math.ceil(remainS / 86400);
  return days > 365
    ? `${Math.floor(days / 365)}y ${days % 365}d until sweep`
    : `${days}d until sweep`;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type RawToken = {
  id: string;
  name: string;
  ticker: string;
  logo_url: string | null;
  mint_address: string | null;
  arc_launch_id: string | null;
  chain?: string;
};

type DividendEntry = {
  id: string;
  name: string;
  ticker: string;
  logo_url: string | null;
  mintAddress: string;       // OMToken address
  feeTier: number;           // 1 = Community, 3 = Max
  pending: bigint | null;    // null = loading
  lastInteraction: bigint;
  claiming: boolean;
  txHash: string | null;
  error: string | null;
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function ArcHolderDividends() {
  const { walletAddress, walletType, selectedChain, isAuthenticated } = useAuth();
  const [entries, setEntries]     = useState<DividendEntry[]>([]);
  const [loading, setLoading]     = useState(false);
  const [nowS, setNowS]           = useState(() => Math.floor(Date.now() / 1000));

  // Horloge pour timers
  useEffect(() => {
    const id = setInterval(() => setNowS(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch & filter ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!walletAddress || !isAuthenticated) return;
    setLoading(true);
    setEntries([]);

    try {
      // 1. Fetch recent Arc V4 tokens (jusqu'à 50)
      const res = await fetch("/api/launchpad/tokens?chain=arc&limit=50&sort=new");
      if (!res.ok) return;
      const { tokens: rawTokens } = await res.json() as { tokens: RawToken[]; total: number };

      // Garder uniquement les V4 (mint_address == arc_launch_id, deux adresses valides)
      const v4Tokens = rawTokens.filter(t =>
        t.mint_address &&
        t.arc_launch_id &&
        t.mint_address.toLowerCase() === t.arc_launch_id.toLowerCase() &&
        t.mint_address.startsWith("0x")
      );
      if (v4Tokens.length === 0) return;

      const client = createPublicClient({ chain: arc, transport: http("/api/arc-rpc") });
      const walletLower = walletAddress.toLowerCase() as `0x${string}`;

      // 2. Pour chaque token en parallèle :
      //    a) Lire feeTier depuis getCurveState
      //    b) Si tier COMMUNITY (1) ou MAX (3), lire pendingDividend + lastInteraction
      const results = await Promise.allSettled(
        v4Tokens.map(async (t) => {
          const mintAddr = t.mint_address as `0x${string}`;

          // a) Résoudre le hook actif + lire feeTier
          let feeTier = -1;
          for (const hookAddr of [ARC_HOOK_ADDRESS, ARC_HOOK_ADDRESS_LEGACY] as `0x${string}`[]) {
            const poolId = getArcV4PoolId(mintAddr, hookAddr);
            const state = await client.readContract({
              address:      hookAddr,
              abi:          BONDING_CURVE_HOOK_ABI,
              functionName: "getCurveState",
              args:         [poolId],
            }).catch(() => null) as { initialized?: boolean; feeTier?: number } | null;
            if (state?.initialized) {
              feeTier = state.feeTier ?? -1;
              break;
            }
          }

          // Filtrer : seuls COMMUNITY (1) et MAX (3) ont des dividendes
          if (feeTier !== 1 && feeTier !== 3) return null;

          // b) Lire pendingDividend + lastInteraction depuis l'OMToken
          const [pending, lastInteraction] = await Promise.all([
            client.readContract({
              address:      mintAddr,
              abi:          OMTOKEN_ABI,
              functionName: "pendingDividend",
              args:         [walletLower],
            }).catch(() => 0n) as Promise<bigint>,
            client.readContract({
              address:      mintAddr,
              abi:          OMTOKEN_ABI,
              functionName: "lastInteraction",
              args:         [walletLower],
            }).catch(() => 0n) as Promise<bigint>,
          ]);

          // Seulement afficher si > dust
          if (pending < DUST) return null;

          return {
            id:              t.id,
            name:            t.name,
            ticker:          t.ticker,
            logo_url:        t.logo_url,
            mintAddress:     mintAddr,
            feeTier,
            pending,
            lastInteraction,
            claiming:        false,
            txHash:          null,
            error:           null,
          } satisfies DividendEntry;
        })
      );

      const valid = results
        .filter((r): r is PromiseFulfilledResult<DividendEntry | null> => r.status === "fulfilled")
        .map(r => r.value)
        .filter((e): e is DividendEntry => e !== null);

      // Trier : plus gros dividende d'abord
      valid.sort((a, b) => (b.pending ?? 0n) > (a.pending ?? 0n) ? 1 : -1);
      setEntries(valid);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  // ── Claim ───────────────────────────────────────────────────────────────────

  async function handleClaim(idx: number) {
    if (!walletType) return;
    const provider = getProviderByType(walletType);
    if (!provider?.request) return;

    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, claiming: true, error: null } : e));

    try {
      const walletClient = createWalletClient({ chain: arc, transport: custom(provider) });
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${arc.id.toString(16)}` }],
        });
      } catch { /* ignore */ }

      const [account] = await walletClient.getAddresses();
      const entry = entries[idx];

      // OMToken.claimDividend() — seul le msg.sender peut claim
      const hash = await walletClient.writeContract({
        address:      entry.mintAddress as `0x${string}`,
        abi:          OMTOKEN_ABI,
        functionName: "claimDividend",
        args:         [],
        account,
        chain:        arc,
      });

      setEntries(prev => prev.map((e, i) =>
        i === idx ? {
          ...e,
          claiming: false,
          txHash: hash,
          pending: 0n,
          lastInteraction: BigInt(Math.floor(Date.now() / 1000)),
        } : e
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setEntries(prev => prev.map((e, i) =>
        i === idx ? { ...e, claiming: false, error: msg.length > 80 ? msg.slice(0, 80) + "…" : msg } : e
      ));
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!isAuthenticated) return null;

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Scanning dividends…
    </div>
  );

  if (entries.length === 0) return (
    <div className="rounded-2xl border border-border bg-card px-4 py-5 text-center">
      <Coins className="size-7 text-muted-foreground/40 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">
        No pending dividends.
      </p>
      <p className="text-xs text-muted-foreground/60 mt-1">
        Community &amp; Max tokens share dividends on every swap.
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Holder Dividends</h3>
        <button
          onClick={() => void load()}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      {entries.map((entry, idx) => {
        const tierName  = entry.feeTier === 1 ? "Community" : "Max";
        const timerLbl  = abandonLabel(entry.lastInteraction, nowS);
        const isDanger  = timerLbl.startsWith("⚠");

        return (
          <div
            key={entry.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
          >
            {/* Logo */}
            <div className="size-10 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
              {entry.logo_url
                ? <Image src={entry.logo_url} alt={entry.name} width={40} height={40} className="object-cover" unoptimized />
                : <span className="text-xs font-bold text-muted-foreground">{entry.ticker.slice(0, 2)}</span>
              }
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-semibold text-foreground truncate">{entry.name}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  entry.feeTier === 3
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-blue-500/10 text-blue-400"
                }`}>
                  {tierName}
                </span>
              </div>

              {/* Pending */}
              <p className="text-xs font-medium text-emerald-400 mt-0.5">
                {entry.pending === null
                  ? "…"
                  : entry.pending === 0n
                  ? "Claimed"
                  : `+ ${fmtUsdc(entry.pending)} USDC`}
              </p>

              {/* Abandon timer */}
              {timerLbl && (
                <p className={`flex items-center gap-1 text-[11px] mt-0.5 ${isDanger ? "text-red-400" : "text-muted-foreground/60"}`}>
                  <Clock className="size-3 shrink-0" />
                  {timerLbl}
                </p>
              )}

              {/* Tx success */}
              {entry.txHash && (
                <a
                  href={`https://explorer.arc.io/tx/${entry.txHash}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline mt-0.5"
                >
                  <CheckCircle2 className="size-3" /> Claimed
                </a>
              )}
              {entry.error && (
                <p className="text-[11px] text-red-400 mt-0.5">{entry.error}</p>
              )}
            </div>

            {/* Claim button */}
            {selectedChain !== "arc" ? (
              <span className="text-[10px] text-muted-foreground text-right shrink-0">
                Switch<br />to Arc
              </span>
            ) : (
              <button
                onClick={() => void handleClaim(idx)}
                disabled={entry.claiming || !entry.pending || entry.pending === 0n}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors shrink-0 ${
                  entry.claiming || !entry.pending || entry.pending === 0n
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                }`}
              >
                {entry.claiming
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
