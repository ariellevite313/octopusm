"use client";

/**
 * ClaimFeesArc — permet au créateur d'un token Arc V2 de réclamer ses USDC.
 *
 * Pré-graduation :
 *   - Lit `creatorAccrued` sur BondingCurveArcV2
 *   - Appelle `claimCreatorFees(to)` → envoie l'ETH natif (USDC Arc) au créateur
 *
 * Post-graduation :
 *   - Lit le solde ETH du GraduationVaultV4 (frais LP accumulés)
 *   - Appelle `collectFees()` sur GraduationVaultV4 → 30% créateur / 70% treasury
 */

import { useState, useEffect, useCallback } from "react";
import { CoinsIcon, Loader2, CheckCircle2, TrendingUpIcon } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import {
  BONDING_CURVE_V2_ABI,
  GRADUATION_VAULT_V4_ABI,
} from "@/lib/arc-launchpad";
import { arc } from "@/lib/arc-chain";

type Props = {
  curveAddress:  string;  // arc_launch_id = adresse du BondingCurveArcV2
  tokenAddress?: string;  // non utilisé en V2 (conservé pour compatibilité props)
  creatorWallet: string;
  vaultAddress?: string;  // adresse du GraduationVaultV4 (optionnel si pas encore graduée)
};

function fmtUsdc(raw: bigint): string {
  const n = Number(raw) / 1e18;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function ClaimFeesArc({ curveAddress, creatorWallet, vaultAddress }: Props) {
  const { walletAddress, walletType, selectedChain, isAuthenticated } = useAuth();

  const [graduated,  setGraduated]  = useState<boolean | null>(null);
  const [accrued,    setAccrued]    = useState<bigint | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [claiming,   setClaiming]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [txHash,     setTxHash]     = useState<string | null>(null);
  const [evmAddress, setEvmAddress] = useState<string | null>(null);

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

  const isCreator = isAuthenticated && !!(
    (evmAddress && creatorWallet && evmAddress === creatorWallet.toLowerCase()) ||
    (walletAddress && creatorWallet && walletAddress.toLowerCase() === creatorWallet.toLowerCase())
  );

  const fetchFees = useCallback(async () => {
    if (!curveAddress) return;
    setLoading(true);
    try {
      const client = createPublicClient({ chain: arc, transport: http("/api/arc-rpc") });
      const curveAddr = curveAddress as `0x${string}`;

      const [grad, creatorAcc] = await Promise.all([
        client.readContract({ address: curveAddr, abi: BONDING_CURVE_V2_ABI, functionName: "graduated" }) as Promise<boolean>,
        client.readContract({ address: curveAddr, abi: BONDING_CURVE_V2_ABI, functionName: "creatorAccrued" }) as Promise<bigint>,
      ]);
      setGraduated(grad);

      if (grad && vaultAddress && vaultAddress !== "0x0000000000000000000000000000000000000000") {
        // Post-graduation : frais LP accumulés dans le vault (solde ETH du vault)
        const vaultBal = await client.getBalance({ address: vaultAddress as `0x${string}` });
        setAccrued(vaultBal);
      } else {
        // Pré-graduation : fees creator accumulés dans la courbe
        setAccrued(creatorAcc);
      }
    } catch {
      setAccrued(null);
    } finally {
      setLoading(false);
    }
  }, [curveAddress, vaultAddress]);

  useEffect(() => { void fetchFees(); }, [fetchFees]);

  const handleClaim = async () => {
    if (!walletType) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (!eth) { setError("MetaMask introuvable"); return; }
    const provider = Array.isArray(eth.providers)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (eth.providers as any[]).find((p: any) => p.isMetaMask && !p.isPhantom) ?? eth
      : eth;

    setClaiming(true);
    setError(null);
    setTxHash(null);

    try {
      const walletClient = createWalletClient({ chain: arc, transport: custom(provider) });

      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${arc.id.toString(16)}` }] });
      } catch { /* ignore */ }

      const [account] = await walletClient.getAddresses();
      let hash: `0x${string}`;

      if (graduated && vaultAddress && vaultAddress !== "0x0000000000000000000000000000000000000000") {
        // Post-graduation : GraduationVaultV4.collectFees()
        hash = await walletClient.writeContract({
          address: vaultAddress as `0x${string}`,
          abi:     GRADUATION_VAULT_V4_ABI,
          functionName: "collectFees",
          args:    [],
          account, chain: arc,
        });
      } else {
        // Pré-graduation : BondingCurveArcV2.claimCreatorFees(to)
        hash = await walletClient.writeContract({
          address: curveAddress as `0x${string}`,
          abi:     BONDING_CURVE_V2_ABI,
          functionName: "claimCreatorFees",
          args:    [account],
          account, chain: arc,
        });
      }

      setTxHash(hash);
      setTimeout(() => { void fetchFees(); }, 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setError(
        msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel")
          ? "Transaction annulée"
          : msg.length > 120 ? msg.slice(0, 120) + "…" : msg,
      );
    } finally {
      setClaiming(false);
    }
  };

  if (!isCreator) return null;

  if (selectedChain !== "arc") {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-6 text-center space-y-3">
        <CoinsIcon className="size-5 text-orange-400 mx-auto" />
        <p className="text-sm font-semibold text-foreground">MetaMask requis pour réclamer les fees</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Connecte MetaMask pour recevoir tes USDC créateur sur Arc.
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

  const buttonLabel = graduated ? "Collect LP fees" : "Claim USDC fees";
  const subLabel    = graduated
    ? "LP fees V4 : 30% créateur · 70% treasury"
    : "1% de chaque trade t'est reversé en USDC natif";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CoinsIcon className="size-4 text-orange-400 shrink-0" />
        <span className="text-sm font-semibold text-foreground">Creator fees (USDC)</span>
        {graduated && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <TrendingUpIcon className="size-3" />
            Graduée · V4
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        {loading ? (
          <span className="text-xs text-muted-foreground">Chargement…</span>
        ) : accrued !== null && accrued > 0n ? (
          <>
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {fmtUsdc(accrued)}
            </span>
            <span className="text-sm text-muted-foreground">USDC disponibles</span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            {accrued === 0n ? "Aucun fee accumulé" : "Impossible de lire le solde"}
          </span>
        )}
      </div>

      {txHash && (
        <a
          href={`https://explorer.arc.io/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-emerald-400 hover:underline"
        >
          <CheckCircle2 className="size-3.5" />
          {graduated ? "Collectés" : "Réclamés"} — Voir sur ArcScan
        </a>
      )}

      {error && <p className="text-[11px] text-red-400">{error}</p>}

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
