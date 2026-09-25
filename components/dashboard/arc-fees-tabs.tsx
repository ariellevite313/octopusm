"use client";

/**
 * ArcFeesTabs — onglets Creator fees / Dividendes
 *
 * Remplace ArcCreatorFees + ArcHolderDividends par un composant unifié
 * avec deux onglets qui basculent.
 *
 * Onglet "Creator fees"  : BondingCurveArcV2.creatorAccrued()  — orange
 * Onglet "Dividendes"    : OMToken.pendingDividend(wallet)      — bleu
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import { Loader2, CheckCircle2 } from "lucide-react";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { getProviderByType } from "@/lib/wallet/adapters";
import { BONDING_CURVE_V2_ABI, OM_TOKEN_ABI } from "@/lib/arc-launchpad";
import { arc } from "@/lib/arc-chain";

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtUsdc(raw: bigint): string {
  const n = Number(raw) / 1e18;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

// ── types ──────────────────────────────────────────────────────────────────────

type BaseToken = {
  id:            string;
  name:          string;
  ticker:        string;
  logo_url:      string | null;
  arc_launch_id: string | null;
  mint_address:  string | null;
};

type CreatorToken = BaseToken & {
  curveAddress: string;
  accrued:      bigint | null;
  claiming:     boolean;
  txHash:       string | null;
  error:        string | null;
};

type DividendToken = BaseToken & {
  tokenAddress: string;
  pending:      bigint | null;
  claiming:     boolean;
  txHash:       string | null;
  error:        string | null;
};

// ── Logo ───────────────────────────────────────────────────────────────────────

function TokenLogo({ token }: { token: BaseToken }) {
  return (
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
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ArcFeesTabs() {
  const { walletAddress, walletType, selectedChain, isAuthenticated } = useAuth();
  const { t } = useT();

  const [activeTab, setActiveTab] = useState<"creator" | "dividend">("creator");

  // creator state
  const [creatorTokens,  setCreatorTokens]  = useState<CreatorToken[]>([]);
  const [creatorLoading, setCreatorLoading] = useState(true);

  // dividend state
  const [divTokens,  setDivTokens]  = useState<DividendToken[]>([]);
  const [divLoading, setDivLoading] = useState(true);

  const client = createPublicClient({ chain: arc, transport: http("/api/arc-rpc") });

  // ── 1. Load creator tokens ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    async function load() {
      setCreatorLoading(true);
      try {
        const res = await fetch("/api/launchpad/mine");
        if (!res.ok) return;
        const all = await res.json() as BaseToken[];
        const v2 = all.filter(t => {
          if (!t.arc_launch_id?.startsWith("0x") || t.arc_launch_id.length !== 42) return false;
          if (t.mint_address && t.arc_launch_id.toLowerCase() === t.mint_address.toLowerCase()) return false;
          return true;
        });
        setCreatorTokens(v2.map(t => ({
          ...t,
          curveAddress: t.arc_launch_id!,
          accrued: null,
          claiming: false,
          txHash: null,
          error: null,
        })));
      } finally {
        setCreatorLoading(false);
      }
    }
    void load();
  }, [isAuthenticated]);

  // ── 2. Read creatorAccrued ─────────────────────────────────────────────────
  useEffect(() => {
    if (creatorTokens.length === 0) return;
    creatorTokens.forEach(async (token, idx) => {
      try {
        const raw = await client.readContract({
          address:      token.curveAddress as `0x${string}`,
          abi:          BONDING_CURVE_V2_ABI,
          functionName: "creatorAccrued",
        }) as bigint;
        setCreatorTokens(prev => prev.map((t, i) => i === idx ? { ...t, accrued: raw } : t));
      } catch {
        setCreatorTokens(prev => prev.map((t, i) => i === idx ? { ...t, accrued: 0n } : t));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorTokens.length]);

  // ── 3. Load dividend tokens ────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !walletAddress) return;
    async function load() {
      setDivLoading(true);
      try {
        const res = await fetch("/api/launchpad/tokens?chain=arc&limit=100&sort=new");
        if (!res.ok) return;
        const data = await res.json() as { tokens: BaseToken[] };
        const v2 = (data.tokens ?? []).filter(t => {
          if (!t.arc_launch_id?.startsWith("0x") || t.arc_launch_id.length !== 42) return false;
          if (!t.mint_address?.startsWith("0x")  || t.mint_address.length  !== 42) return false;
          if (t.arc_launch_id.toLowerCase() === t.mint_address.toLowerCase()) return false;
          return true;
        });
        setDivTokens(v2.map(t => ({
          ...t,
          tokenAddress: t.mint_address!,
          pending: null,
          claiming: false,
          txHash: null,
          error: null,
        })));
      } finally {
        setDivLoading(false);
      }
    }
    void load();
  }, [isAuthenticated, walletAddress]);

  // ── 4. Read pendingDividend ────────────────────────────────────────────────
  useEffect(() => {
    if (divTokens.length === 0 || !walletAddress) return;
    divTokens.forEach(async (token) => {
      try {
        const raw = await client.readContract({
          address:      token.tokenAddress as `0x${string}`,
          abi:          OM_TOKEN_ABI,
          functionName: "pendingDividend",
          args:         [walletAddress as `0x${string}`],
        }) as bigint;
        setDivTokens(prev => prev.map(t => t.id === token.id ? { ...t, pending: raw } : t));
      } catch {
        setDivTokens(prev => prev.map(t => t.id === token.id ? { ...t, pending: 0n } : t));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divTokens.length, walletAddress]);

  // ── 5. Claim creator fee ───────────────────────────────────────────────────
  async function handleClaimCreator(idx: number) {
    if (!walletAddress || !walletType) return;
    const provider = getProviderByType(walletType);
    if (!provider?.request) return;

    const token = creatorTokens[idx];
    if (!token.accrued || token.accrued === 0n) return;
    const accruedAmount = token.accrued;

    setCreatorTokens(prev => prev.map((t, i) => i === idx ? { ...t, claiming: true, error: null } : t));
    try {
      const walletClient = createWalletClient({ chain: arc, transport: custom(provider) });
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${arc.id.toString(16)}` }] });
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

      setCreatorTokens(prev => prev.map((t, i) =>
        i === idx ? { ...t, claiming: false, txHash: hash, accrued: 0n } : t
      ));

      fetch("/api/dashboard/log-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: token.id, walletAddress: account,
          amountSol: 0, amountUsdc: Number(accruedAmount) / 1e18,
          txSignature: hash, chain: "arc",
        }),
      }).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setCreatorTokens(prev => prev.map((t, i) =>
        i === idx ? { ...t, claiming: false, error: msg.length > 80 ? msg.slice(0, 80) + "…" : msg } : t
      ));
    }
  }

  // ── 6. Claim dividend ──────────────────────────────────────────────────────
  async function handleClaimDividend(tokenId: string) {
    if (!walletAddress || !walletType) return;
    const provider = getProviderByType(walletType);
    if (!provider?.request) return;

    setDivTokens(prev => prev.map(t => t.id === tokenId ? { ...t, claiming: true, error: null } : t));
    try {
      const walletClient = createWalletClient({ chain: arc, transport: custom(provider) });
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${arc.id.toString(16)}` }] });
      } catch { /* ignore */ }

      const [account] = await walletClient.getAddresses();
      const token = divTokens.find(t => t.id === tokenId)!;
      const pendingAmount = token.pending ?? 0n;

      const hash = await walletClient.writeContract({
        address:      token.tokenAddress as `0x${string}`,
        abi:          OM_TOKEN_ABI,
        functionName: "claimDividend",
        args:         [],
        account,
        chain:        arc,
      });

      setDivTokens(prev => prev.map(t =>
        t.id === tokenId ? { ...t, claiming: false, txHash: hash, pending: 0n } : t
      ));

      // Log to DB so Total Claimed updates
      fetch("/api/dashboard/log-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId:      token.id,
          walletAddress: account,
          amountSol:    0,
          amountUsdc:   Number(pendingAmount) / 1e18,
          txSignature:  hash,
          chain:        "arc",
          claimType:    "dividend",
        }),
      }).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setDivTokens(prev => prev.map(t =>
        t.id === tokenId ? { ...t, claiming: false, error: msg.length > 80 ? msg.slice(0, 80) + "…" : msg } : t
      ));
    }
  }

  if (!isAuthenticated) return null;

  // totals pour les badges dans les onglets
  const totalCreator  = creatorTokens.reduce((s, t) => s + (t.accrued  ?? 0n), 0n);
  const totalDividend = divTokens.filter(t => t.pending !== null && t.pending > 0n)
                                 .reduce((s, t) => s + (t.pending ?? 0n), 0n);

  // Dividendes : n'afficher que ceux avec pending ou déjà claimé
  const visibleDiv = divTokens.filter(t => t.pending === null || t.pending > 0n || t.txHash);

  return (
    <div className="space-y-0">

      {/* ── Onglets ─────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("creator")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === "creator"
              ? "border-orange-500 text-orange-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.creatorFees}
          {totalCreator > 0n && (
            <span className="ml-2 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-500">
              {fmtUsdc(totalCreator)}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("dividend")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === "dividend"
              ? "border-blue-500 text-blue-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.dividends}
          {totalDividend > 0n && (
            <span className="ml-2 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-500">
              {fmtUsdc(totalDividend)}
            </span>
          )}
        </button>
      </div>

      {/* ── Panneau Creator fees ─────────────────────────────────────────────── */}
      {activeTab === "creator" && (
        <div className="space-y-2 pt-3">
          {creatorLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t.loading}
            </div>
          ) : creatorTokens.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t.noArcTokens}</p>
          ) : (
            creatorTokens.map((token, idx) => (
              <div
                key={token.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <TokenLogo token={token} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{token.name}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {token.accrued !== null && token.accrued > 0n && (
                      <Image src="/usdc-coin.png" alt="USDC" width={12} height={12} className="rounded-full shrink-0" unoptimized />
                    )}
                    {token.accrued === null
                      ? t.reading
                      : token.accrued === 0n
                      ? t.noCreatorFees
                      : `${fmtUsdc(token.accrued)} ${t.usdcClaimable}`}
                  </div>
                  {token.txHash && (
                    <a
                      href={`https://explorer.arc.io/tx/${token.txHash}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline mt-0.5"
                    >
                      <CheckCircle2 className="size-3" /> {t.claimedViewExplorer}
                    </a>
                  )}
                  {token.error && <p className="text-[11px] text-red-400 mt-0.5">{token.error}</p>}
                </div>

                {selectedChain !== "arc" ? (
                  <span className="text-[10px] text-muted-foreground text-right shrink-0 whitespace-pre-line">{t.connectWallet}</span>
                ) : token.accrued === null ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                ) : token.accrued === 0n ? (
                  <span className="text-xs text-muted-foreground shrink-0">—</span>
                ) : (
                  <button
                    onClick={() => void handleClaimCreator(idx)}
                    disabled={token.claiming}
                    className="rounded-full px-4 py-2 text-xs font-semibold shrink-0 bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-60 transition-colors"
                  >
                    {token.claiming ? <Loader2 className="size-3.5 animate-spin" /> : t.claim}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Panneau Dividendes ───────────────────────────────────────────────── */}
      {activeTab === "dividend" && (
        <div className="space-y-2 pt-3">
          {divLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t.loadingDividends}
            </div>
          ) : visibleDiv.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t.noDividends}</p>
          ) : (
            visibleDiv.map(token => {
              const hasBalance = token.pending !== null && token.pending > 0n;
              const isLoading  = token.pending === null;
              const isClaimed  = !!token.txHash;

              return (
                <div
                  key={token.id}
                  className={`flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 transition-opacity ${
                    isClaimed ? "opacity-50" : "opacity-100"
                  } ${hasBalance ? "border-blue-500/30" : "border-border"}`}
                >
                  <TokenLogo token={token} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[13px] font-medium text-foreground truncate">{token.name}</p>
                      <span className="text-[11px] text-muted-foreground">${token.ticker}</span>
                    </div>

                    {isLoading ? (
                      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <Loader2 className="size-3 animate-spin text-blue-500" /> {t.reading}
                      </div>
                    ) : (
                      <div className={`mt-0.5 flex items-center gap-1 text-[12px] ${hasBalance ? "font-semibold text-blue-500" : "text-muted-foreground"}`}>
                        <Image src="/usdc-coin.png" alt="USDC" width={13} height={13} className="rounded-full shrink-0" unoptimized />
                        {hasBalance
                          ? `${fmtUsdc(token.pending!)} ${t.usdcClaimable}`
                          : isClaimed ? "0.00 USDC"
                          : t.noDividends}
                      </div>
                    )}

                    {isClaimed && (
                      <a
                        href={`https://explorer.arc.io/tx/${token.txHash}`}
                        target="_blank" rel="noopener noreferrer"
                        className="mt-0.5 flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                      >
                        <CheckCircle2 className="size-3" /> {t.claimedViewExplorer}
                      </a>
                    )}
                    {token.error && <p className="mt-0.5 text-[11px] text-red-400">{token.error}</p>}
                  </div>

                  {selectedChain !== "arc" ? (
                    <span className="shrink-0 text-right text-[10px] text-muted-foreground whitespace-pre-line">{t.connectWallet}</span>
                  ) : isLoading ? (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Loader2 className="size-3.5 animate-spin text-blue-500" />
                    </div>
                  ) : (
                    <button
                      onClick={() => void handleClaimDividend(token.id)}
                      disabled={token.claiming || !hasBalance}
                      className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                        hasBalance && !token.claiming
                          ? "bg-orange-500 hover:bg-orange-400 text-white"
                          : "cursor-not-allowed bg-muted text-muted-foreground"
                      }`}
                    >
                      {token.claiming ? <Loader2 className="size-3.5 animate-spin" /> : t.claim}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
