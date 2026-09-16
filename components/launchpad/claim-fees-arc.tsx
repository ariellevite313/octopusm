"use client";

/**
 * ClaimFeesArc — permet au créateur d'un token Arc de réclamer ses USDC.
 *
 * Deux modes selon l'état du token :
 *
 * Pré-graduation (bonding curve active) :
 *   - Lit `creatorFeesAccrued()` sur BondingCurve
 *   - Appelle `claimFees(walletAddress)` → envoie l'USDC au créateur
 *
 * Post-graduation (V3LPVault) :
 *   - Lit `pendingUsdcFees()` sur V3LPVault
 *   - Appelle `collectFees()` (keeper-friendly, n'importe qui peut déclencher)
 *     → distribue 67% treasury / 33% créateur (ou holders si holderRewards)
 */

import { useState, useEffect, useCallback } from "react";
import { CoinsIcon, Loader2, CheckCircle2, TrendingUpIcon } from "lucide-react";
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

// ── ABI V3LPVault (minimal) ───────────────────────────────────────────────────
const V3LP_VAULT_ABI = [
  {
    name: "pendingUsdcFees",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "collectFees",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

// ── ABI BondingCurve étendu (graduated + vault) ───────────────────────────────
const CURVE_ABI_EXT = [
  ...BONDING_CURVE_ABI,
  {
    name: "graduated",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "vault",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

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
  const { walletAddress, walletType, selectedChain, isAuthenticated } = useAuth();

  const [graduated,    setGraduated]    = useState<boolean | null>(null);
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [accrued,      setAccrued]      = useState<bigint | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [claiming,     setClaiming]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [txHash,       setTxHash]       = useState<string | null>(null);
  // evmAddress: adresse MetaMask réelle (peut différer de walletAddress Solana)
  const [evmAddress,   setEvmAddress]   = useState<string | null>(null);

  // Récupérer l'adresse EVM depuis MetaMask au montage
  useEffect(() => {
    const eth = (window as unknown as Record<string, unknown>).ethereum as { request?: (a: unknown) => Promise<string[]>; providers?: unknown[] } | undefined;
    if (!eth?.request) return;
    const provider = Array.isArray(eth.providers)
      ? (eth.providers as Array<{ isMetaMask?: boolean; isPhantom?: boolean; request?: unknown }>).find(p => p.isMetaMask && !p.isPhantom) ?? eth
      : eth;
    (provider as { request?: (a: unknown) => Promise<string[]> }).request?.({ method: "eth_accounts" })
      .then((accounts: string[]) => { if (accounts[0]) setEvmAddress(accounts[0].toLowerCase()); })
      .catch(() => null);
  }, []);

  // isCreator : true si l'adresse EVM MetaMask OU walletAddress auth correspond au creator
  const isCreator = isAuthenticated && !!(
    (evmAddress && creatorWallet && evmAddress === creatorWallet.toLowerCase()) ||
    (walletAddress && creatorWallet && walletAddress.toLowerCase() === creatorWallet.toLowerCase())
  );

  // ── Read fees ──────────────────────────────────────────────────────────────

  const fetchFees = useCallback(async () => {
    setLoading(true);
    try {
      const client = createPublicClient({ chain: arcTestnet, transport: http() });
      const curve  = curveAddress as `0x${string}`;

      // 1. Vérifier si gradué
      const isGrad = await client.readContract({
        address: curve, abi: CURVE_ABI_EXT, functionName: "graduated",
      }).catch(() => false) as boolean;

      setGraduated(isGrad);

      if (isGrad) {
        // 2a. Lire l'adresse du vault depuis la courbe
        const vault = await client.readContract({
          address: curve, abi: CURVE_ABI_EXT, functionName: "vault",
        }).catch(() => null) as `0x${string}` | null;

        if (vault && vault !== "0x0000000000000000000000000000000000000000") {
          setVaultAddress(vault);
          // 2b. Lire les fees pendantes dans le vault
          const pending = await client.readContract({
            address: vault, abi: V3LP_VAULT_ABI, functionName: "pendingUsdcFees",
          }).catch(() => 0n) as bigint;
          setAccrued(pending);
        } else {
          setAccrued(0n);
        }
      } else {
        // 2c. Pré-graduation : lire fees accumulées sur la courbe
        const raw = await client.readContract({
          address: curve, abi: BONDING_CURVE_ABI, functionName: "creatorFeesAccrued",
        }).catch(() => 0n) as bigint;
        setAccrued(raw);
      }
    } catch {
      setAccrued(null);
    } finally {
      setLoading(false);
    }
  }, [curveAddress]);

  useEffect(() => { void fetchFees(); }, [fetchFees]);

  // ── Claim / Collect ────────────────────────────────────────────────────────

  const handleClaim = async () => {
    if (!walletAddress || !walletType) return;
    const provider = getProviderByType(walletType);
    if (!provider?.request) { setError("Wallet unavailable"); return; }

    setClaiming(true);
    setError(null);
    setTxHash(null);

    try {
      const walletClient = createWalletClient({
        chain: arcTestnet, transport: custom(provider),
      });

      // Switch to Arc si nécessaire
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${arcTestnet.id.toString(16)}` }],
        });
      } catch { /* ignore */ }

      const [account] = await walletClient.getAddresses();
      let hash: `0x${string}`;

      if (graduated && vaultAddress) {
        // Post-graduation : collectFees() sur V3LPVault
        hash = await walletClient.writeContract({
          address:      vaultAddress as `0x${string}`,
          abi:          V3LP_VAULT_ABI,
          functionName: "collectFees",
          args:         [],
          account,
          chain:        arcTestnet,
        });
      } else {
        // Pré-graduation : claimFees(to) sur BondingCurve
        hash = await walletClient.writeContract({
          address:      curveAddress as `0x${string}`,
          abi:          BONDING_CURVE_ABI,
          functionName: "claimFees",
          args:         [account],
          account,
          chain:        arcTestnet,
        });
      }

      setTxHash(hash);
      setTimeout(() => { void fetchFees(); }, 3000);
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

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (!isCreator) return null;

  if (selectedChain !== "arc") {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-6 text-center space-y-3">
        <CoinsIcon className="size-5 text-orange-400 mx-auto" />
        <p className="text-sm font-semibold text-foreground">MetaMask required to claim fees</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Connect MetaMask to receive your USDC creator fees on Arc.
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 px-4 py-2 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/20 transition-colors"
        >
          Switch wallet
        </button>
      </div>
    );
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  const buttonLabel = graduated ? "Collect V3 fees" : "Claim USDC fees";
  const subLabel    = graduated
    ? "V3 LP fees are distributed 67% platform / 33% you"
    : "1% of every trade goes to you in USDC";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CoinsIcon className="size-4 text-orange-400 shrink-0" />
        <span className="text-sm font-semibold text-foreground">Creator fees (USDC)</span>
        {graduated && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <TrendingUpIcon className="size-3" />
            Graduated · V3
          </span>
        )}
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
          {graduated ? "Collected" : "Claimed"} — View on ArcScan
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
            {graduated ? "Collecting…" : "Claiming…"}
          </span>
        ) : buttonLabel}
      </button>

      <p className="text-[10px] text-center text-muted-foreground/40">{subLabel}</p>
    </div>
  );
}
