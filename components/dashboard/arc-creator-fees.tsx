"use client";

/**
 * ArcCreatorFees
 *
 * Lists all Arc tokens created by the user and shows claimable USDC fees
 * for each, read directly from the BondingCurve contract onchain.
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import { Loader2, CheckCircle2 } from "lucide-react";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { useAuth } from "@/providers/auth-provider";
import { getProviderByType } from "@/lib/wallet/adapters";
import { BONDING_CURVE_ABI } from "@/lib/arc-launchpad";
import { arcTestnet } from "@/lib/arc-chain";

const USDC_DECIMALS = 6;

function fmtUsdc(raw: bigint): string {
  const n = Number(raw) / 10 ** USDC_DECIMALS;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

type ArcToken = {
  id: string;
  name: string;
  ticker: string;
  logo_url: string | null;
  arc_launch_id: string | null; // BondingCurve address
};

type TokenWithFees = ArcToken & {
  accrued: bigint | null; // null = RPC error
  claiming: boolean;
  txHash: string | null;
  error: string | null;
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
        // Keep only Arc tokens with a valid BondingCurve address
        const arcTokens = all.filter(
          t => t.arc_launch_id?.startsWith("0x") && t.arc_launch_id.length === 42
        );
        setTokens(arcTokens.map(t => ({
          ...t,
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

  // 2. Read creatorFeesAccrued for each token
  useEffect(() => {
    if (tokens.length === 0) return;
    const client = createPublicClient({ chain: arcTestnet, transport: http() });

    tokens.forEach(async (token, idx) => {
      if (!token.arc_launch_id) return;
      try {
        const raw = await client.readContract({
          address: token.arc_launch_id as `0x${string}`,
          abi: BONDING_CURVE_ABI,
          functionName: "creatorFeesAccrued",
        }) as bigint;
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
      const walletClient = createWalletClient({ chain: arcTestnet, transport: custom(provider) });
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${arcTestnet.id.toString(16)}` }],
        });
      } catch { /* ignore */ }

      const [account] = await walletClient.getAddresses();
      const curveAddress = tokens[idx].arc_launch_id as `0x${string}`;

      const hash = await walletClient.writeContract({
        address: curveAddress,
        abi: BONDING_CURVE_ABI,
        functionName: "claimFees",
        args: [account],
        account,
        chain: arcTestnet,
      });

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

  if (!isAuthenticated || selectedChain !== "arc") return null;
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
            <p className="text-sm font-semibold text-foreground truncate">{token.name}</p>
            <p className="text-xs text-muted-foreground">
              {token.accrued === null
                ? "Reading…"
                : token.accrued === 0n
                ? "No fees yet"
                : `${fmtUsdc(token.accrued)} USDC claimable`}
            </p>
            {token.txHash && (
              <a
                href={`https://testnet.arcscan.app/tx/${token.txHash}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline mt-0.5"
              >
                <CheckCircle2 className="size-3" /> Claimed
              </a>
            )}
            {token.error && <p className="text-[11px] text-red-400 mt-0.5">{token.error}</p>}
          </div>

          {/* Claim button */}
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
        </div>
      ))}
    </div>
  );
}
