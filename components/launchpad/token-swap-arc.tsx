"use client";

/**
 * TokenSwapArc — widget buy/sell pour les tokens Arc.
 *
 * Deux modes selon le format de arc_launch_id :
 *  - "old" : arc_launch_id est un uint256 stringifié (ex: "3") → ancien contrat flat
 *  - "new" : arc_launch_id est une adresse 0x...              → clone BondingCurve AMM
 *
 * Mode "new" (tous les tokens créés après la migration) :
 *   - Approve USDC → BondingCurve.buy(usdcIn, minTokensOut, recipient)
 *   - Approve TOKEN → BondingCurve.sell(tokensIn, minUsdcOut, recipient)
 *   - Quote via quoteUsdcToTokens / quoteTokensToUsdc
 */

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, custom, encodeFunctionData, parseAbi } from "viem";
import { Loader2, CheckCircle2, ExternalLink, ArrowUpDown } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import {
  ARC_LAUNCHPAD_ADDRESS,
  ARC_USDC_ADDRESS,
  LAUNCHPAD_ABI,
  BONDING_CURVE_ABI,
  ERC20_APPROVE_ABI,
} from "@/lib/arc-launchpad";
import { arcTestnet } from "@/lib/arc-chain";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  launchId:     string;   // arc_launch_id — numeric string (old) ou 0x... (new)
  tokenAddress: string;   // mint_address (ERC-20 du token)
  ticker:       string;
  logoUrl?:     string;
};

type Direction = "buy" | "sell";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNewContract(launchId: string): boolean {
  return launchId.startsWith("0x") || launchId.startsWith("0X");
}

function fmtUsdc(raw: bigint): string {
  return (Number(raw) / 1e6).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function fmtTokens(raw: bigint, dec = 18): string {
  const n = Number(raw) / Math.pow(10, dec);
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/**
 * Convertit une string décimale en bigint sans perte de précision float64.
 * Ex: parseDecimalToBigInt("12345678.9", 18) → 12345678900000000000000000n
 */
function parseDecimalToBigInt(value: string, decimals: number): bigint {
  const [intStr, fracStr = ""] = value.split(".");
  const frac = fracStr.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(intStr || "0") * BigInt(10 ** decimals) + BigInt(frac || "0");
}

/** Affiche un bigint (18 dec) en string lisible pour l'input. */
function bigintToInputString(raw: bigint, decimals: number, maxFrac = 6): string {
  const divisor = BigInt(10 ** decimals);
  const intPart  = raw / divisor;
  const fracPart = raw % divisor;
  if (fracPart === 0n) return intPart.toString();
  const fracStr  = fracPart.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  return fracStr ? `${intPart}.${fracStr}` : intPart.toString();
}

function openWalletModal() {
  window.dispatchEvent(new CustomEvent("open-wallet-connect"));
}

const ERC20_BALANCE_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);

// ─── Component ────────────────────────────────────────────────────────────────

export function TokenSwapArc({ launchId, tokenAddress, ticker, logoUrl }: Props) {
  const { walletAddress, walletType, selectedChain, isAuthenticated } = useAuth();

  // Arc tokens require an Arc (EVM) wallet
  if (isAuthenticated && selectedChain !== "arc") {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">Arc wallet required</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          This token runs on Arc (EVM).<br />
          Connect an EVM wallet (MetaMask, Rabby…) to trade.
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 px-4 py-2 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/20 transition-colors"
        >
          Switch wallet
        </button>
      </div>
    );
  }

  const isNew    = isNewContract(launchId);
  const curveAddr = isNew ? (launchId as `0x${string}`) : ARC_LAUNCHPAD_ADDRESS;
  const oldId     = isNew ? 0n : BigInt(launchId || "0");

  const [direction,   setDirection]   = useState<Direction>("buy");
  const [amount,      setAmount]      = useState("");
  const [slippagePct, setSlippagePct] = useState(2);

  // Balances
  const [usdcBalance,  setUsdcBalance]  = useState<bigint | null>(null);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);

  // State on-chain
  const [graduated,     setGraduated]     = useState(false);
  const [progressBps,   setProgressBps]   = useState<bigint>(0n);
  const [gradThreshold, setGradThreshold] = useState<bigint>(0n);
  const [realRaised,    setRealRaised]    = useState<bigint>(0n);

  // Quote (new contract)
  const [estimatedOut, setEstimatedOut] = useState<bigint | null>(null);
  // Quote (old contract)
  const [costPerToken, setCostPerToken] = useState<bigint | null>(null); // USDC raw per 1e18 tokens

  // Tx
  const [swapping, setSwapping] = useState(false);
  const [txHash,   setTxHash]   = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  // ── Provider ──────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getEth(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    let eth = w.ethereum;
    if (Array.isArray(eth?.providers)) {
      eth = eth.providers.find(
        (p: { isMetaMask?: boolean; isPhantom?: boolean }) => p.isMetaMask && !p.isPhantom
      ) ?? eth;
    }
    if (!eth) throw new Error("MetaMask introuvable");
    return eth;
  }

  function getPublicClient() {
    return createPublicClient({ chain: arcTestnet, transport: custom(getEth()) });
  }

  // ── Load on-chain state ───────────────────────────────────────────────────

  const loadState = useCallback(async () => {
    if (!launchId) return;
    try {
      const client = getPublicClient();

      if (isNew) {
        // New BondingCurve clone
        const [grad, progress, threshold, raised] = await Promise.all([
          client.readContract({ address: curveAddr, abi: BONDING_CURVE_ABI, functionName: "graduated" }) as Promise<boolean>,
          client.readContract({ address: curveAddr, abi: BONDING_CURVE_ABI, functionName: "graduationProgressBps" }) as Promise<bigint>,
          client.readContract({ address: curveAddr, abi: BONDING_CURVE_ABI, functionName: "GRAD_THRESHOLD" }) as Promise<bigint>,
          client.readContract({ address: curveAddr, abi: BONDING_CURVE_ABI, functionName: "realUsdcRaised" }) as Promise<bigint>,
        ]);
        setGraduated(grad);
        setProgressBps(progress);
        setGradThreshold(threshold);
        setRealRaised(raised);
      } else {
        // Old flat contract
        const cost1 = await client.readContract({
          address:      ARC_LAUNCHPAD_ADDRESS,
          abi:          LAUNCHPAD_ABI,
          functionName: "getBuyCost",
          args:         [oldId, BigInt("1000000000000000000")],
        }) as bigint;
        setCostPerToken(cost1);

        const launch = await client.readContract({
          address:      ARC_LAUNCHPAD_ADDRESS,
          abi:          LAUNCHPAD_ABI,
          functionName: "launches",
          args:         [oldId],
        }) as [string, string, bigint, bigint, bigint, bigint, boolean];
        setGraduated(launch[6]);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchId]);

  const loadBalances = useCallback(async () => {
    if (!walletAddress) { setUsdcBalance(null); setTokenBalance(null); return; }
    try {
      const client = getPublicClient();
      const addr   = walletAddress as `0x${string}`;

      const [usdcBal, tokBal] = await Promise.all([
        client.readContract({
          address: ARC_USDC_ADDRESS, abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf", args: [addr],
        }) as Promise<bigint>,
        tokenAddress
          ? client.readContract({
              address: tokenAddress as `0x${string}`, abi: ERC20_BALANCE_ABI,
              functionName: "balanceOf", args: [addr],
            }) as Promise<bigint>
          : Promise.resolve(0n),
      ]);
      setUsdcBalance(usdcBal);
      setTokenBalance(tokBal);
    } catch { setUsdcBalance(null); setTokenBalance(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, tokenAddress]);

  useEffect(() => { void loadState(); }, [loadState]);
  useEffect(() => { void loadBalances(); }, [loadBalances]);

  // ── Quote ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setEstimatedOut(null); return; }

    if (isNew) {
      void (async () => {
        try {
          const client  = getPublicClient();
          const usdcRaw = BigInt(Math.round(parsed * 1e6));

          if (direction === "buy") {
            const [tokensOut] = await client.readContract({
              address: curveAddr, abi: BONDING_CURVE_ABI,
              functionName: "quoteUsdcToTokens", args: [usdcRaw],
            }) as [bigint, bigint];
            setEstimatedOut(tokensOut);
          } else {
            const tokensIn = parseDecimalToBigInt(amount, 18);
            const [usdcOut] = await client.readContract({
              address: curveAddr, abi: BONDING_CURVE_ABI,
              functionName: "quoteTokensToUsdc", args: [tokensIn],
            }) as [bigint, bigint];
            setEstimatedOut(usdcOut);
          }
        } catch { setEstimatedOut(null); }
      })();
    } else {
      // Old contract — buy only, derived from costPerToken
      if (!costPerToken || costPerToken === 0n) { setEstimatedOut(null); return; }
      const usdcRaw = BigInt(Math.round(parsed * 1e6));
      setEstimatedOut((usdcRaw * BigInt("1000000000000000000")) / costPerToken);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, direction, costPerToken, launchId]);

  // ── Ensure Arc Testnet ────────────────────────────────────────────────────

  async function ensureArcChain(eth: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = eth as any;
    const chainHex = await e.request({ method: "eth_chainId" }) as string;
    if (parseInt(chainHex, 16) !== 5042002) {
      await e.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x4CEF52" }],
      }).catch(async (err: { code?: number }) => {
        if (err?.code === 4902) {
          await e.request({ method: "wallet_addEthereumChain", params: [{
            chainId: "0x4CEF52", chainName: "Arc Testnet",
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: ["https://rpc.testnet.arc.network"],
            blockExplorerUrls: ["https://testnet.arcscan.app"],
          }]});
        } else throw err;
      });
    }
  }

  // ── Wait receipt helper ───────────────────────────────────────────────────

  async function waitReceipt(hash: string) {
    const client = getPublicClient();
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const r = await client.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
      if (r) return r;
    }
    return null;
  }

  // ── Swap handler ──────────────────────────────────────────────────────────

  const handleSwap = async () => {
    if (!walletAddress || !amount || !estimatedOut) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;

    setSwapping(true);
    setError(null);
    setTxHash(null);

    try {
      const eth = getEth();
      await ensureArcChain(eth);
      const client = getPublicClient();

      if (isNew) {
        // ── NEW BondingCurve AMM ────────────────────────────────────────────
        const slipMul = BigInt(Math.round((100 - slippagePct) * 10));

        if (direction === "buy") {
          const usdcRaw   = BigInt(Math.round(parsed * 1e6));
          const minTokens = (estimatedOut * slipMul) / 1000n;

          if (usdcBalance !== null && usdcRaw > usdcBalance) throw new Error("Solde USDC insuffisant");

          // Allowance check
          const allowance = await client.readContract({
            address: ARC_USDC_ADDRESS, abi: ERC20_BALANCE_ABI,
            functionName: "allowance",
            args: [walletAddress as `0x${string}`, curveAddr],
          }) as bigint;

          if (allowance < usdcRaw) {
            const approveData = encodeFunctionData({
              abi: ERC20_APPROVE_ABI, functionName: "approve",
              args: [curveAddr, usdcRaw * 2n],
            });
            const approveTx = await eth.request({
              method: "eth_sendTransaction",
              params: [{ from: walletAddress, to: ARC_USDC_ADDRESS, data: approveData }],
            }) as string;
            await waitReceipt(approveTx);
          }

          // buy(usdcIn, minTokensOut, recipient)
          const buyData = encodeFunctionData({
            abi: BONDING_CURVE_ABI, functionName: "buy",
            args: [usdcRaw, minTokens, walletAddress as `0x${string}`],
          });
          const hash = await eth.request({
            method: "eth_sendTransaction",
            params: [{ from: walletAddress, to: curveAddr, data: buyData }],
          }) as string;
          setTxHash(hash);
          await waitReceipt(hash);

        } else {
          // SELL
          const tokensIn = parseDecimalToBigInt(amount, 18);
          const minUsdc  = (estimatedOut * slipMul) / 1000n;

          if (tokenBalance !== null && tokensIn > tokenBalance) throw new Error("Solde token insuffisant");

          // Approve token → curve
          const tokenAllowance = await client.readContract({
            address: tokenAddress as `0x${string}`, abi: ERC20_BALANCE_ABI,
            functionName: "allowance",
            args: [walletAddress as `0x${string}`, curveAddr],
          }) as bigint;

          if (tokenAllowance < tokensIn) {
            const approveData = encodeFunctionData({
              abi: ERC20_APPROVE_ABI, functionName: "approve",
              args: [curveAddr, tokensIn * 2n],
            });
            const approveTx = await eth.request({
              method: "eth_sendTransaction",
              params: [{ from: walletAddress, to: tokenAddress, data: approveData }],
            }) as string;
            await waitReceipt(approveTx);
          }

          // sell(tokensIn, minUsdcOut, recipient)
          const sellData = encodeFunctionData({
            abi: BONDING_CURVE_ABI, functionName: "sell",
            args: [tokensIn, minUsdc, walletAddress as `0x${string}`],
          });
          const hash = await eth.request({
            method: "eth_sendTransaction",
            params: [{ from: walletAddress, to: curveAddr, data: sellData }],
          }) as string;
          setTxHash(hash);
          await waitReceipt(hash);
        }

      } else {
        // ── OLD flat contract (buy only) ─────────────────────────────────────
        const usdcRaw   = BigInt(Math.round(parsed * 1e6));
        const minTokens = (estimatedOut * BigInt(Math.round((100 - slippagePct) * 10))) / 1000n;

        if (usdcBalance !== null && usdcRaw > usdcBalance) throw new Error("Solde USDC insuffisant");

        // Allowance
        const allowance = await client.readContract({
          address: ARC_USDC_ADDRESS, abi: ERC20_BALANCE_ABI,
          functionName: "allowance",
          args: [walletAddress as `0x${string}`, ARC_LAUNCHPAD_ADDRESS],
        }) as bigint;

        if (allowance < usdcRaw) {
          const approveData = encodeFunctionData({
            abi: ERC20_APPROVE_ABI, functionName: "approve",
            args: [ARC_LAUNCHPAD_ADDRESS as `0x${string}`, usdcRaw * 2n],
          });
          const approveTx = await eth.request({
            method: "eth_sendTransaction",
            params: [{ from: walletAddress, to: ARC_USDC_ADDRESS, data: approveData }],
          }) as string;
          await waitReceipt(approveTx);
        }

        // buy(id, tokenAmount)
        const buyData = encodeFunctionData({
          abi: LAUNCHPAD_ABI, functionName: "buy",
          args: [oldId, minTokens],
        });
        const hash = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: walletAddress, to: ARC_LAUNCHPAD_ADDRESS, data: buyData }],
        }) as string;
        setTxHash(hash);
        await waitReceipt(hash);
      }

      setAmount("");
      setEstimatedOut(null);
      setTimeout(() => void loadBalances(), 2000);
      setTimeout(() => void loadState(),    2500);

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

  // ── Render ────────────────────────────────────────────────────────────────

  const inputBalance = direction === "buy" ? usdcBalance : tokenBalance;
  const inputSymbol  = direction === "buy" ? "USDC"      : ticker;
  const outputSymbol = direction === "buy" ? ticker      : "USDC";

  const balFmt = inputBalance !== null
    ? `${direction === "buy" ? fmtUsdc(inputBalance) : fmtTokens(inputBalance)} ${inputSymbol}`
    : "—";

  const outFmt = estimatedOut && estimatedOut > 0n
    ? `~${direction === "buy" ? fmtTokens(estimatedOut) : fmtUsdc(estimatedOut)} ${outputSymbol}`
    : "";

  const canSwap = !!amount && parseFloat(amount) > 0 && !swapping && !graduated && !!estimatedOut;

  // Progress bar data (new contract only)
  const progressPct = gradThreshold > 0n
    ? Math.min(100, Number((realRaised * 10000n) / gradThreshold) / 100)
    : 0;

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

  const PayBadge  = () => direction === "buy" ? <UsdcBadge />  : <TokenBadge />;
  const RecvBadge = () => direction === "buy" ? <TokenBadge /> : <UsdcBadge />;

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card">
      <div className="p-4 space-y-2">

        {graduated && (
          <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 text-center">
            <p className="text-xs font-semibold text-indigo-400">🎓 Graduated — trade on Uniswap V2</p>
          </div>
        )}

        {/* Buy / Sell tabs — new contract only (old has no sell) */}
        {isNew && !graduated && (
          <div className="flex rounded-xl overflow-hidden border border-border">
            {(["buy", "sell"] as Direction[]).map(d => (
              <button
                key={d}
                onClick={() => { setDirection(d); setAmount(""); setEstimatedOut(null); }}
                className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors capitalize ${
                  direction === d
                    ? d === "buy"
                      ? "bg-emerald-500 text-white"
                      : "bg-red-500 text-white"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}

        {/* Bonding curve progress (new contract) */}
        {isNew && !graduated && gradThreshold > 0n && (
          <div className="space-y-1 px-0.5">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Bonding curve</span>
              <span>{fmtUsdc(realRaised)} / {fmtUsdc(gradThreshold)} USDC</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-right">
              {progressBps > 0n ? `${(Number(progressBps) / 100).toFixed(1)}%` : "0%"} to graduation
            </p>
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
            <PayBadge />
            <span className="text-[11px] text-muted-foreground/60">
              {walletAddress ? `Balance: ${balFmt}` : "—"}
            </span>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center -my-0.5">
          <div className="size-7 rounded-full bg-muted flex items-center justify-center">
            <ArrowUpDown className="size-3.5 text-muted-foreground" />
          </div>
        </div>

        {/* Receive */}
        <div className="rounded-2xl bg-muted/40 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-muted-foreground font-medium">You receive</p>
          <div className="min-h-[40px] flex items-center">
            {outFmt ? (
              <span className="text-[28px] font-semibold text-foreground">{outFmt}</span>
            ) : (
              <span className="text-[28px] font-semibold text-muted-foreground/30">0</span>
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            <RecvBadge />
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
                  if (!inputBalance) return;
                  // Division bigint pour éviter la perte de précision float64
                  const portion = (inputBalance * BigInt(pct)) / 100n;
                  const decimals = direction === "buy" ? 6 : 18;
                  setAmount(bigintToInputString(portion, decimals, direction === "buy" ? 2 : 4));
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
                  slippagePct === s
                    ? "bg-blue-500 border-blue-500 text-white"
                    : "bg-muted/40 border-border text-muted-foreground"
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
            className="w-full rounded-md py-2.5 text-[15px] font-semibold bg-orange-500 hover:bg-orange-400 text-white transition-colors mt-1"
          >
            Connect wallet
          </button>
        ) : (
          <button
            onClick={() => void handleSwap()}
            disabled={!canSwap}
            className={`w-full rounded-md py-4 text-[15px] font-semibold transition-colors mt-1 ${
              !canSwap
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : direction === "sell"
                  ? "bg-red-500 hover:bg-red-400 text-white"
                  : "bg-orange-500 hover:bg-orange-400 text-white"
            }`}
          >
            {swapping ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {direction === "buy" ? "Buying…" : "Selling…"}
              </span>
            ) : graduated
              ? "Graduated"
              : direction === "buy"
                ? `Buy $${ticker}`
                : `Sell $${ticker}`}
          </button>
        )}

        <p className="text-center text-[10px] text-muted-foreground/40 pb-1">
          Arc Network · {isNew ? "AMM Bonding curve" : "Bonding curve"}
        </p>
      </div>
    </div>
  );
}
