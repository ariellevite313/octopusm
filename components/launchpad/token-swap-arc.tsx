"use client";

/**
 * TokenSwapArc — widget buy/sell pour les tokens Arc.
 *
 * Trois modes selon le format de arc_launch_id :
 *  - "old"          : arc_launch_id est un uint256 stringifié → ancien contrat flat
 *  - "new"          : arc_launch_id est une adresse 0x...     → clone BondingCurve AMM (USDC)
 *  - "stock-paired" : comme "new" mais quoteAsset est un xStock ERC-20 (GenericBondingCurve)
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
  GENERIC_BONDING_CURVE_ABI,
  ERC20_APPROVE_ABI,
} from "@/lib/arc-launchpad";
import { arc } from "@/lib/arc-chain";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  launchId:     string;              // arc_launch_id — numeric string (old) ou 0x... (new)
  tokenAddress: string;              // mint_address (ERC-20 du token)
  ticker:       string;
  logoUrl?:     string;
  // Stock-paired fields (optional — only set for stock-paired tokens)
  quoteAsset?:  string | null;       // address of the xStock ERC-20
  stockSymbol?: string | null;       // e.g. "NVDA" (without "x" prefix)
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
 */
function parseDecimalToBigInt(value: string, decimals: number): bigint {
  const [intStr, fracStr = ""] = value.split(".");
  const frac = fracStr.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(intStr || "0") * BigInt(10 ** decimals) + BigInt(frac || "0");
}

/** Affiche un bigint en string lisible pour l'input. */
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

export function TokenSwapArc({ launchId, tokenAddress, ticker, logoUrl, quoteAsset, stockSymbol }: Props) {
  const { walletAddress, selectedChain, isAuthenticated } = useAuth();

  const isNew        = isNewContract(launchId);
  const isStockPaired = isNew && !!quoteAsset;
  const curveAddr    = isNew ? (launchId as `0x${string}`) : ARC_LAUNCHPAD_ADDRESS;
  const oldId        = isNew ? 0n : BigInt(launchId || "0");

  // Quote asset: xStock address for stock-paired, USDC for standard
  const quoteAddress = (isStockPaired ? quoteAsset! : ARC_USDC_ADDRESS) as `0x${string}`;
  // "xNVDA" or "USDC"
  const quoteSymbol  = isStockPaired ? `x${stockSymbol ?? "STOCK"}` : "USDC";
  // ABI to use for the bonding curve
  const curveAbi     = isStockPaired ? GENERIC_BONDING_CURVE_ABI : BONDING_CURVE_ABI;

  const [direction,   setDirection]   = useState<Direction>("buy");
  const [amount,      setAmount]      = useState("");
  const [slippagePct, setSlippagePct] = useState(2);

  // Balances
  const [quoteBalance, setQuoteBalance] = useState<bigint | null>(null);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);

  // Stock price (for display only)
  const [stockPriceUsd, setStockPriceUsd] = useState<number | null>(null);

  // State on-chain
  const [graduated,     setGraduated]     = useState(false);
  const [progressBps,   setProgressBps]   = useState<bigint>(0n);
  const [gradThreshold, setGradThreshold] = useState<bigint>(0n);
  const [realRaised,    setRealRaised]    = useState<bigint>(0n);

  // Quote
  const [estimatedOut, setEstimatedOut] = useState<bigint | null>(null);
  const [costPerToken, setCostPerToken] = useState<bigint | null>(null); // old contract only

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
    return createPublicClient({ chain: arc, transport: custom(getEth()) });
  }

  // ── Stock price fetch ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isStockPaired || !stockSymbol) return;
    const sym = `x${stockSymbol}`;
    fetch(`/api/launchpad/stock-price/${sym}`)
      .then(r => r.json())
      .then((d: { priceUsd?: number }) => { if (d.priceUsd) setStockPriceUsd(d.priceUsd); })
      .catch(() => {});
  }, [isStockPaired, stockSymbol]);

  // ── Load on-chain state ───────────────────────────────────────────────────

  const loadState = useCallback(async () => {
    if (!launchId) return;
    try {
      const client = getPublicClient();

      if (isNew) {
        const raisedFn = isStockPaired ? "realQuoteRaised" : "realUsdcRaised";
        const [grad, progress, threshold, raised] = await Promise.all([
          client.readContract({ address: curveAddr, abi: curveAbi, functionName: "graduated" }) as Promise<boolean>,
          client.readContract({ address: curveAddr, abi: curveAbi, functionName: "graduationProgressBps" }) as Promise<bigint>,
          client.readContract({ address: curveAddr, abi: curveAbi, functionName: "GRAD_THRESHOLD" }) as Promise<bigint>,
          client.readContract({ address: curveAddr, abi: curveAbi, functionName: raisedFn }) as Promise<bigint>,
        ]);
        setGraduated(grad);
        setProgressBps(progress);
        setGradThreshold(threshold);
        setRealRaised(raised);
      } else {
        const cost1 = await client.readContract({
          address: ARC_LAUNCHPAD_ADDRESS, abi: LAUNCHPAD_ABI,
          functionName: "getBuyCost",
          args: [oldId, BigInt("1000000000000000000")],
        }) as bigint;
        setCostPerToken(cost1);

        const launch = await client.readContract({
          address: ARC_LAUNCHPAD_ADDRESS, abi: LAUNCHPAD_ABI,
          functionName: "launches", args: [oldId],
        }) as [string, string, bigint, bigint, bigint, bigint, boolean];
        setGraduated(launch[6]);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchId, isStockPaired]);

  const loadBalances = useCallback(async () => {
    if (!walletAddress) { setQuoteBalance(null); setTokenBalance(null); return; }
    try {
      const client = getPublicClient();
      const addr   = walletAddress as `0x${string}`;

      const [quoteBal, tokBal] = await Promise.all([
        client.readContract({
          address: quoteAddress, abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf", args: [addr],
        }) as Promise<bigint>,
        tokenAddress
          ? client.readContract({
              address: tokenAddress as `0x${string}`, abi: ERC20_BALANCE_ABI,
              functionName: "balanceOf", args: [addr],
            }) as Promise<bigint>
          : Promise.resolve(0n),
      ]);
      setQuoteBalance(quoteBal);
      setTokenBalance(tokBal);
    } catch { setQuoteBalance(null); setTokenBalance(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, tokenAddress, quoteAddress]);

  useEffect(() => { void loadState(); }, [loadState]);
  useEffect(() => { void loadBalances(); }, [loadBalances]);

  // ── Quote ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setEstimatedOut(null); return; }

    if (isNew) {
      void (async () => {
        try {
          const client   = getPublicClient();
          const quoteRaw = BigInt(Math.round(parsed * 1e6));

          if (direction === "buy") {
            const quoteFn = isStockPaired ? "quoteToTokens" : "quoteUsdcToTokens";
            const [tokensOut] = await client.readContract({
              address: curveAddr, abi: curveAbi,
              functionName: quoteFn, args: [quoteRaw],
            }) as [bigint, bigint];
            setEstimatedOut(tokensOut);
          } else {
            const tokensIn = parseDecimalToBigInt(amount, 18);
            const quoteFn  = isStockPaired ? "tokensToQuote" : "quoteTokensToUsdc";
            const [quoteOut] = await client.readContract({
              address: curveAddr, abi: curveAbi,
              functionName: quoteFn, args: [tokensIn],
            }) as [bigint, bigint];
            setEstimatedOut(quoteOut);
          }
        } catch { setEstimatedOut(null); }
      })();
    } else {
      if (!costPerToken || costPerToken === 0n) { setEstimatedOut(null); return; }
      const quoteRaw = BigInt(Math.round(parsed * 1e6));
      setEstimatedOut((quoteRaw * BigInt("1000000000000000000")) / costPerToken);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, direction, costPerToken, launchId, isStockPaired]);

  // ── Ensure Arc Mainnet ───────────────────────────────────────────────────

  async function ensureArcChain(eth: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = eth as any;
    const chainHex = await e.request({ method: "eth_chainId" }) as string;
    if (parseInt(chainHex, 16) !== 5042) {
      await e.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x13B2" }],
      }).catch(async (err: { code?: number }) => {
        if (err?.code === 4902) {
          await e.request({ method: "wallet_addEthereumChain", params: [{
            chainId: "0x13B2", chainName: "Arc",
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: ["https://rpc.mainnet.arc.io"],
            blockExplorerUrls: ["https://explorer.arc.io"],
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
        // ── NEW BondingCurve (USDC) or GenericBondingCurve (xStock) ─────────
        const slipMul = BigInt(Math.round((100 - slippagePct) * 10));

        if (direction === "buy") {
          const quoteRaw  = BigInt(Math.round(parsed * 1e6));
          const minTokens = (estimatedOut * slipMul) / 1000n;

          if (quoteBalance !== null && quoteRaw > quoteBalance) {
            throw new Error(`Solde ${quoteSymbol} insuffisant`);
          }

          // Allowance check — approve quoteAddress (USDC or xStock)
          const allowance = await client.readContract({
            address: quoteAddress, abi: ERC20_BALANCE_ABI,
            functionName: "allowance",
            args: [walletAddress as `0x${string}`, curveAddr],
          }) as bigint;

          if (allowance < quoteRaw) {
            const approveData = encodeFunctionData({
              abi: ERC20_APPROVE_ABI, functionName: "approve",
              args: [curveAddr, quoteRaw * 2n],
            });
            const approveTx = await eth.request({
              method: "eth_sendTransaction",
              params: [{ from: walletAddress, to: quoteAddress, data: approveData }],
            }) as string;
            await waitReceipt(approveTx);
          }

          // buy(quoteIn, minTokensOut, recipient)
          const buyData = encodeFunctionData({
            abi: curveAbi, functionName: "buy",
            args: [quoteRaw, minTokens, walletAddress as `0x${string}`],
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
          const minQuote = (estimatedOut * slipMul) / 1000n;

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

          // sell(tokensIn, minQuoteOut, recipient)
          const sellData = encodeFunctionData({
            abi: curveAbi, functionName: "sell",
            args: [tokensIn, minQuote, walletAddress as `0x${string}`],
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
        const quoteRaw  = BigInt(Math.round(parsed * 1e6));
        const minTokens = (estimatedOut * BigInt(Math.round((100 - slippagePct) * 10))) / 1000n;

        if (quoteBalance !== null && quoteRaw > quoteBalance) throw new Error("Solde USDC insuffisant");

        const allowance = await client.readContract({
          address: ARC_USDC_ADDRESS, abi: ERC20_BALANCE_ABI,
          functionName: "allowance",
          args: [walletAddress as `0x${string}`, ARC_LAUNCHPAD_ADDRESS],
        }) as bigint;

        if (allowance < quoteRaw) {
          const approveData = encodeFunctionData({
            abi: ERC20_APPROVE_ABI, functionName: "approve",
            args: [ARC_LAUNCHPAD_ADDRESS as `0x${string}`, quoteRaw * 2n],
          });
          const approveTx = await eth.request({
            method: "eth_sendTransaction",
            params: [{ from: walletAddress, to: ARC_USDC_ADDRESS, data: approveData }],
          }) as string;
          await waitReceipt(approveTx);
        }

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
      // Refresh balances + bonding curve state — retry a few times in case the block isn't indexed yet
      [1500, 3000, 6000].forEach(ms => setTimeout(() => void loadBalances(), ms));
      [2000, 4000, 8000].forEach(ms => setTimeout(() => void loadState(),    ms));

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

  const inputBalance = direction === "buy" ? quoteBalance : tokenBalance;
  const inputSymbol  = direction === "buy" ? quoteSymbol  : ticker;
  const outputSymbol = direction === "buy" ? ticker       : quoteSymbol;

  const balFmt = inputBalance !== null
    ? `${direction === "buy" ? fmtUsdc(inputBalance) : fmtTokens(inputBalance)} ${inputSymbol}`
    : "—";

  const outFmt = estimatedOut && estimatedOut > 0n
    ? `~${direction === "buy" ? fmtTokens(estimatedOut) : fmtUsdc(estimatedOut)} ${outputSymbol}`
    : "";

  const canSwap = !!amount && parseFloat(amount) > 0 && !swapping && !graduated && !!estimatedOut;

  const progressPct = gradThreshold > 0n
    ? Math.min(100, Number((realRaised * 10000n) / gradThreshold) / 100)
    : 0;

  // Market cap calculé depuis la formule AMM constant-product :
  // mcap = (VIRTUAL_USDC + realRaised)² × totalSupply / (VIRTUAL_USDC × curveSupply)
  // En USDC (sans décimales) — graduation à ~$25,000
  const VIRTUAL_USDC_N  = 3_200_000_000n;
  const CURVE_SUPPLY_N  = 800_000_000n;
  const TOTAL_SUPPLY_N  = 1_000_000_000n;
  const reserveUsdc     = VIRTUAL_USDC_N + realRaised;
  const currentMcapRaw  = reserveUsdc * reserveUsdc * TOTAL_SUPPLY_N / (VIRTUAL_USDC_N * CURVE_SUPPLY_N);
  const currentMcapUsdc = Number(currentMcapRaw) / 1_000_000; // 6 dec → USD
  const GRAD_MCAP_USDC  = 25_000; // constant — graduation toujours à ~$25K

  function fmtMcap(usd: number): string {
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000)     return `$${(usd / 1_000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
  }

  const QuoteBadge = () => (
    <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-full px-3 py-1.5">
      {isStockPaired ? (
        <div className="size-5 rounded-full bg-amber-400/80 flex items-center justify-center text-[8px] font-bold text-white">📈</div>
      ) : (
        <div className="size-5 rounded-full bg-blue-400 flex items-center justify-center text-[8px] font-bold text-white">$</div>
      )}
      <span className="text-[13px] font-semibold text-foreground">{quoteSymbol}</span>
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

  const PayBadge  = () => direction === "buy" ? <QuoteBadge /> : <TokenBadge />;
  const RecvBadge = () => direction === "buy" ? <TokenBadge /> : <QuoteBadge />;

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card">
      <div className="p-4 space-y-2">

        {/* Stock-paired info banner */}
        {isStockPaired && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-400">📈 Stock-Paired</p>
              <p className="text-[10px] text-amber-400/70 mt-0.5">Quote asset: {quoteSymbol}</p>
            </div>
            {stockPriceUsd !== null && (
              <div className="text-right">
                <p className="text-xs font-bold text-amber-400">${stockPriceUsd.toFixed(2)}</p>
                <p className="text-[10px] text-amber-400/70">per {quoteSymbol}</p>
              </div>
            )}
          </div>
        )}

        {graduated && (
          <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 text-center">
            <p className="text-xs font-semibold text-indigo-400">🎓 Graduated — trade on Uniswap V4</p>
          </div>
        )}

        {/* Buy / Sell tabs — new contract only */}
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

        {/* Bonding curve progress */}
        {isNew && !graduated && gradThreshold > 0n && (
          <div className="space-y-1 px-0.5">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Bonding curve</span>
              <span>MC {fmtMcap(currentMcapUsdc)} / {fmtMcap(GRAD_MCAP_USDC)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isStockPaired ? "bg-amber-500" : "bg-blue-500"}`}
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
                  const portion  = (inputBalance * BigInt(pct)) / 100n;
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

        {/* Fee breakdown */}
        {amount && parseFloat(amount) > 0 && direction === "buy" && (
          <div className="flex items-center justify-between px-1 pt-0.5">
            <span className="text-[11px] text-muted-foreground">Fee (2%)</span>
            <span className="text-[11px] text-muted-foreground">
              ~{(parseFloat(amount) * 0.02).toFixed(4)} {quoteSymbol}
              <span className="opacity-50 ml-1">(1% creator · 1% platform)</span>
            </span>
          </div>
        )}

        {error && <p className="text-[11px] text-red-400 text-center">{error}</p>}

        {txHash && (
          <a
            href={`https://explorer.arc.io/tx/${txHash}`}
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
          Arc Network · {isNew ? (isStockPaired ? `AMM · ${quoteSymbol} paired` : "AMM Bonding curve") : "Bonding curve"}
        </p>
      </div>
    </div>
  );
}
