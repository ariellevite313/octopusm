"use client";

/**
 * TokenSwapArc — widget buy pour les tokens Arc Launchpad.
 * Appelle ARC_LAUNCHPAD_ADDRESS.buy(launchId, tokenAmount) via MetaMask.
 * launchId = arc_launch_id stocké en DB (uint256 de l'event Created).
 */

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, custom, parseAbi, encodeFunctionData } from "viem";
import { Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import {
  ARC_LAUNCHPAD_ADDRESS,
  ARC_USDC_ADDRESS,
  LAUNCHPAD_ABI,
  ERC20_APPROVE_ABI,
} from "@/lib/arc-launchpad";
import { arcTestnet } from "@/lib/arc-chain";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  launchId:     string;   // arc_launch_id (stringified uint256)
  tokenAddress: string;   // mint_address (ERC-20)
  ticker:       string;
  logoUrl?:     string;
};

const USDC_DECIMALS = 6;

const ERC20_BALANCE_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);

function fmtUsdc(raw: bigint): string {
  return (Number(raw) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTokens(raw: bigint, dec = 18): string {
  const n = Number(raw) / Math.pow(10, dec);
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function openWalletModal() {
  window.dispatchEvent(new CustomEvent("open-wallet-connect"));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TokenSwapArc({ launchId, tokenAddress: _tokenAddress, ticker, logoUrl }: Props) {
  const { walletAddress, isAuthenticated } = useAuth();

  const id = BigInt(launchId || "0");

  const [amount,      setAmount]      = useState("");
  const [slippagePct, setSlippagePct] = useState(2); // %
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
  const [graduated,   setGraduated]   = useState(false);

  // Quote
  const [estimatedTokens, setEstimatedTokens] = useState<bigint | null>(null);
  const [costPerToken,    setCostPerToken]     = useState<bigint | null>(null); // USDC raw per 1e18 tokens
  const [quoteLoading,    setQuoteLoading]     = useState(false);

  // Tx
  const [swapping, setSwapping] = useState(false);
  const [txHash,   setTxHash]   = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  // ── Get eth provider ─────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getEth(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    let eth = w.ethereum;
    if (Array.isArray(eth?.providers)) {
      eth = eth.providers.find((p: { isMetaMask?: boolean; isPhantom?: boolean }) => p.isMetaMask && !p.isPhantom) ?? eth;
    }
    if (!eth) throw new Error("MetaMask introuvable");
    return eth;
  }

  function getPublicClient() {
    const eth = getEth();
    return createPublicClient({ chain: arcTestnet, transport: custom(eth) });
  }

  // ── Load state on-chain ──────────────────────────────────────────────────

  const loadState = useCallback(async () => {
    if (id === 0n) return;
    try {
      const client = getPublicClient();

      // Cost of 1 full token (18 dec)
      const cost1 = await client.readContract({
        address:      ARC_LAUNCHPAD_ADDRESS,
        abi:          LAUNCHPAD_ABI,
        functionName: "getBuyCost",
        args:         [id, BigInt("1000000000000000000")],
      }) as bigint;
      setCostPerToken(cost1);

      // Launch state — graduated flag
      const launch = await client.readContract({
        address:      ARC_LAUNCHPAD_ADDRESS,
        abi:          LAUNCHPAD_ABI,
        functionName: "launches",
        args:         [id],
      }) as [string, string, bigint, bigint, bigint, bigint, boolean];
      setGraduated(launch[6]);

    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchId]);

  const loadBalance = useCallback(async () => {
    if (!walletAddress) { setUsdcBalance(null); return; }
    try {
      const client = getPublicClient();
      const bal = await client.readContract({
        address:      ARC_USDC_ADDRESS,
        abi:          ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args:         [walletAddress as `0x${string}`],
      }) as bigint;
      setUsdcBalance(bal);
    } catch { setUsdcBalance(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  useEffect(() => { void loadState(); }, [loadState]);
  useEffect(() => { void loadBalance(); }, [loadBalance]);

  // ── Quote ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0 || !costPerToken || costPerToken === 0n) {
      setEstimatedTokens(null);
      return;
    }
    setQuoteLoading(true);
    // tokensToBuy (18 dec) = usdcRaw * 1e18 / costPerToken
    const usdcRaw = BigInt(Math.round(parsed * 1e6));
    const tokens  = (usdcRaw * BigInt("1000000000000000000")) / costPerToken;
    setEstimatedTokens(tokens);
    setQuoteLoading(false);
  }, [amount, costPerToken]);

  // ── Swap ─────────────────────────────────────────────────────────────────

  const handleBuy = async () => {
    if (!walletAddress || !amount) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0 || !estimatedTokens) return;

    setSwapping(true);
    setError(null);
    setTxHash(null);

    try {
      const eth = getEth();

      // Ensure Arc Testnet
      const chainHex = await eth.request({ method: "eth_chainId" }) as string;
      if (parseInt(chainHex, 16) !== 5042002) {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x4CEF52" }],
        }).catch(async (e: { code?: number }) => {
          if (e?.code === 4902) {
            await eth.request({ method: "wallet_addEthereumChain", params: [{
              chainId: "0x4CEF52", chainName: "Arc Testnet",
              nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
              rpcUrls: ["https://rpc.testnet.arc.network"],
              blockExplorerUrls: ["https://testnet.arcscan.app"],
            }]});
          } else throw e;
        });
      }

      const client    = getPublicClient();
      const usdcRaw   = BigInt(Math.round(parsed * 1e6));
      const minTokens = estimatedTokens * BigInt(Math.round((100 - slippagePct) * 10)) / 1000n;

      // Balance check
      if (usdcBalance !== null && usdcRaw > usdcBalance) {
        throw new Error("Solde USDC insuffisant");
      }

      // 1. Check allowance
      const allowance = await client.readContract({
        address:      ARC_USDC_ADDRESS,
        abi:          ERC20_BALANCE_ABI,
        functionName: "allowance",
        args:         [walletAddress as `0x${string}`, ARC_LAUNCHPAD_ADDRESS],
      }) as bigint;

      // 2. Approve if needed
      if (allowance < usdcRaw) {
        const approveData = encodeApprove(ARC_LAUNCHPAD_ADDRESS as `0x${string}`, usdcRaw * 2n);
        const approveTx = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: walletAddress, to: ARC_USDC_ADDRESS, data: approveData }],
        }) as string;
        // Wait for approval
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const r = await client.getTransactionReceipt({ hash: approveTx as `0x${string}` }).catch(() => null);
          if (r) break;
        }
      }

      // 3. Buy
      const buyData = encodeBuy(id, minTokens);
      const hash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: walletAddress, to: ARC_LAUNCHPAD_ADDRESS, data: buyData }],
      }) as string;

      setTxHash(hash);

      // 4. Wait receipt
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
        if (receipt) {
          if ((receipt as { status?: string }).status === "0x0") {
            throw new Error("Transaction revertée — vérifiez ArcScan");
          }
          break;
        }
      }

      setAmount("");
      setEstimatedTokens(null);
      setTimeout(() => void loadBalance(), 2000);

    } catch (e) {
      const msg = e instanceof Error ? e.message : "Échec de la transaction";
      setError(
        msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel")
          ? "Transaction annulée"
          : msg,
      );
    } finally {
      setSwapping(false);
    }
  };

  // ── ABI encoders via viem (sélecteurs calculés automatiquement) ──────────

  function encodeApprove(spender: `0x${string}`, amount: bigint): `0x${string}` {
    return encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: "approve", args: [spender, amount] });
  }

  function encodeBuy(id: bigint, tokenAmount: bigint): `0x${string}` {
    return encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "buy", args: [id, tokenAmount] });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const balFmt = usdcBalance !== null ? `${fmtUsdc(usdcBalance)} USDC` : "—";
  const outFmt = estimatedTokens && estimatedTokens > 0n
    ? `~${fmtTokens(estimatedTokens)} ${ticker}`
    : "";
  const canBuy = !!amount && parseFloat(amount) > 0 && !swapping && !graduated && !!estimatedTokens;

  const UsdcBadge = () => (
    <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-full px-3 py-1.5">
      <div className="size-5 rounded-full bg-blue-400 flex items-center justify-center text-[8px] font-bold text-white">$</div>
      <span className="text-[13px] font-semibold text-foreground">USDC</span>
    </div>
  );

  const TokenBadge = () => (
    <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-full px-3 py-1.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={ticker} className="size-5 rounded-full object-cover" />
      ) : (
        <div className="size-5 rounded-full bg-blue-500/80 flex items-center justify-center text-[8px] font-bold text-white">
          {ticker.slice(0, 1)}
        </div>
      )}
      <span className="text-[13px] font-semibold text-foreground">{ticker}</span>
    </div>
  );

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card">
      <div className="p-4 space-y-2">

        {graduated && (
          <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 text-center">
            <p className="text-xs font-semibold text-indigo-400">🎓 Graduated — trade on Uniswap V2</p>
          </div>
        )}

        {/* Pay */}
        <div className="rounded-2xl bg-muted/40 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-muted-foreground font-medium">You pay</p>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            disabled={graduated || swapping}
            className="w-full bg-transparent text-[28px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/30 disabled:opacity-50"
          />
          <div className="flex items-center justify-between mt-1">
            <UsdcBadge />
            <span className="text-[11px] text-muted-foreground/60">
              {walletAddress ? `Balance: ${balFmt}` : "—"}
            </span>
          </div>
        </div>

        {/* Receive */}
        <div className="rounded-2xl bg-muted/40 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-muted-foreground font-medium">You receive</p>
          <div className="min-h-[40px] flex items-center">
            {quoteLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : outFmt ? (
              <span className="text-[28px] font-semibold text-foreground">{outFmt}</span>
            ) : (
              <span className="text-[28px] font-semibold text-muted-foreground/30">0</span>
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            <TokenBadge />
            <span className="text-[11px] text-muted-foreground/60">estimated</span>
          </div>
        </div>

        {/* % shortcuts */}
        {!graduated && (
          <div className="flex gap-2 pt-1">
            {[25, 50, 75, 100].map(pct => (
              <button
                key={pct}
                onClick={() => {
                  const base = Number(usdcBalance ?? 0n) / 1e6;
                  setAmount(((base * pct) / 100).toFixed(2));
                }}
                className="flex-1 py-2 rounded-full text-[12px] font-semibold border bg-muted/40 border-border text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors"
              >
                {pct}%
              </button>
            ))}
          </div>
        )}

        {/* Slippage */}
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[12px] text-muted-foreground">Slippage</span>
          <div className="flex gap-1.5">
            {[1, 2, 5].map(s => (
              <button
                key={s}
                onClick={() => setSlippagePct(s)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  slippagePct === s ? "bg-blue-500 border-blue-500 text-white" : "bg-muted/40 border-border text-muted-foreground"
                }`}
              >
                {s}%
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-[11px] text-red-400 text-center">{error}</p>}

        {txHash && (
          <a
            href={`https://testnet.arcscan.app/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-400 hover:underline"
          >
            <CheckCircle2 className="size-3.5" />
            Confirmé — ArcScan
            <ExternalLink className="size-3" />
          </a>
        )}

        {!isAuthenticated ? (
          <button
            onClick={openWalletModal}
            className="w-full rounded-full py-4 text-[15px] font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-colors mt-1"
          >
            Connect wallet
          </button>
        ) : (
          <button
            onClick={() => void handleBuy()}
            disabled={!canBuy}
            className={`w-full rounded-full py-4 text-[15px] font-semibold transition-colors mt-1 ${
              !canBuy
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-400 text-white"
            }`}
          >
            {swapping ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Buying…
              </span>
            ) : graduated ? "Graduated" : `Buy $${ticker}`}
          </button>
        )}

        <p className="text-center text-[10px] text-muted-foreground/40 pb-1">
          Arc Network · Bonding curve
        </p>
      </div>
    </div>
  );
}
