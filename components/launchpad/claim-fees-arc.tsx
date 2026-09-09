"use client";

/**
 * ClaimFeesArc — permet au créateur d'un token Arc de réclamer ses USDC
 * accumulés depuis les frais de trading (1% sur chaque trade, côté créateur).
 *
 * Flux :
 *  1. Lit `creatorFeesAccrued()` sur le contrat BondingCurve (lecture gratuite)
 *  2. Quand le créateur clique, appelle `claimFees(walletAddress)` via MetaMask/EVM
 */

import { useState, useEffect, useCallback } from "react";
import { CoinsIcon, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { getProviderByType } from "@/lib/wallet/adapters";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
} from "viem";
import { BONDING_CURVE_ABI } from "@/lib/arc-launchpad";
import { arcTestnet } from "@/lib/arc-chain";

type Props = {
  curveAddress: string; // arc_launch_id (0x… BondingCurve clone)
  creatorWallet: string;
};

const USDC_DECIMALS = 6;

function fmtUsdc(raw: bigint): string {
  const n = Number(raw) / 10 ** USDC_DECIMALS;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function ClaimFeesArc({ curveAddress, creatorWallet }: Props) {
  const { walletAddress, walletType, isAuthenticated } = useAuth();

  const [accrued,   setAccrued]   = useState<bigint | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [claiming,  setClaiming]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [txHash,    setTxHash]    = useState<string | null>(null);

  const isCreator = isAuthenticated && walletAddress?.toLowerCase() === creatorWallet.toLowerCase();

  // ── Read accrued fees ──────────────────────────────────────────────────────

  const fetchAccrued = useCallback(async () => {
    try {
      const client = createPublicClient({
        chain:     arcTestnet,
        transport: http(),
      });
      const raw = await client.readContract({
        address:      curveAddress as `0x${string}`,
        abi:          BONDING_CURVE_ABI,
        functionName: "creatorFeesAccrued",
      }) as bigint;
      setAccrued(raw);
    } catch {
      setAccrued(null);
    } finally {
      setLoading(false);
    }
  }, [curveAddress]);

  useEffect(() => { void fetchAccrued(); }, [fetchAccrued]);

  // ── Claim ──────────────────────────────────────────────────────────────────

  const handleClaim = async () => {
    if (!walletAddress || !walletType) return;
    const provider = getProviderByType(walletType);
    if (!provider?.request) { setError("Wallet unavailable"); return; }

    setClaiming(true);
    setError(null);
    setTxHash(null);

    try {
      const walletClient = createWalletClient({
        chain:     arcTestnet,
        transport: custom(provider),
      });

      // Switch to Arc chain if needed
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${arcTestnet.id.toString(16)}` }],
        });
      } catch { /* ignore — wallet may handle it */ }

      const [account] = await walletClient.getAddresses();

      const hash = await walletClient.writeContract({
        address:      curveAddress as `0x${string}`,
        abi:          BONDING_CURVE_ABI,
        functionName: "claimFees",
        args:         [account],
        account,
        chain:        arcTestnet,
      });

      setTxHash(hash);
      // Refresh balance after a short delay
      setTimeout(() => { void fetchAccrued(); }, 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setError(
        msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel")
          ? "Transaction cancelled"
          : msg.length > 120 ? msg.slice(0, 120) + "…" : msg,
      );
    } finally {
      setClaiming(false);
    }
  };

  // ── Don't show anything if not the creator ────────────────────────────────
  if (!isCreator) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CoinsIcon className="size-4 text-orange-400 shrink-0" />
        <span className="text-sm font-semibold text-foreground">Creator fees (USDC)</span>
      </div>

      {/* Amount */}
      <div className="flex items-baseline gap-1.5">
        {loading ? (
          <span className="text-xs text-muted-foreground">Loading…</span>
        ) : accrued !== null && accrued > 0n ? (
          <>
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {fmtUsdc(accrued)}
            </span>
            <span className="text-sm text-muted-foreground">USDC available</span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            {accrued === 0n ? "No fees accumulated yet" : "Unable to read balance"}
          </span>
        )}
      </div>

      {/* Success */}
      {txHash && (
        <a
          href={`https://testnet.arcscan.app/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-emerald-400 hover:underline"
        >
          <CheckCircle2 className="size-3.5" />
          Claimed — View on ArcScan
        </a>
      )}

      {/* Error */}
      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {/* CTA */}
      <button
        onClick={() => void handleClaim()}
        disabled={claiming || loading || !accrued || accrued === 0n}
        className={`w-full rounded-full py-3 text-[14px] font-semibold transition-colors ${
          claiming || loading || !accrued || accrued === 0n
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-orange-500 hover:bg-orange-400 text-white"
        }`}
      >
        {claiming ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Claiming…
          </span>
        ) : "Claim USDC fees"}
      </button>

      <p className="text-[10px] text-center text-muted-foreground/40">
        1% de chaque trade vous revient en USDC
      </p>
    </div>
  );
}
