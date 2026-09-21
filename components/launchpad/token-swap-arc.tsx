"use client";

/**
 * TokenSwapArc — widget buy/sell pour les tokens Arc V2.
 *
 * Architecture V2 :
 *   • Pré-graduation : BondingCurveArcV2 standalone (native ETH = USDC Arc)
 *   • Post-graduation : pool Uniswap V4 standard (fee=2500, spacing=25, hook=0x0)
 *
 * launchId = adresse du clone BondingCurveArcV2 (arc_launch_id en DB).
 */

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, http, encodeFunctionData, parseAbi } from "viem";
import { Loader2, CheckCircle2, ExternalLink, ArrowUpDown } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import {
  BONDING_CURVE_V2_ABI,
  BC_GRAD_THRESHOLD,
  BC_VIRTUAL_USDC,
  BC_CURVE_SUPPLY,
  BC_K,
  BC_FEE_BPS,
  quoteArcBuy,
  quoteArcSell,
} from "@/lib/arc-launchpad";
import { arc } from "@/lib/arc-chain";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  launchId:     string;  // arc_launch_id = adresse du BondingCurveArcV2
  tokenAddress: string;  // mint_address (ERC-20 du token)
  ticker:       string;
  logoUrl?:     string;
};

type Direction = "buy" | "sell";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtUsdc(raw: bigint): string {
  return (Number(raw) / 1e18).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 6,
  });
}

function fmtTokens(raw: bigint): string {
  const n = Number(raw) / 1e18;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function parseDecimalToBigInt(value: string, decimals: number): bigint {
  const [intStr, fracStr = ""] = value.split(".");
  const frac = fracStr.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(intStr || "0") * BigInt(10 ** decimals) + BigInt(frac || "0");
}

function bigintToInputString(raw: bigint, decimals: number, maxFrac = 6): string {
  const divisor = BigInt(10 ** decimals);
  const intPart  = raw / divisor;
  const fracPart = raw % divisor;
  if (fracPart === 0n) return intPart.toString();
  const fracStr  = fracPart.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  return fracStr ? `${intPart}.${fracStr}` : intPart.toString();
}

function fmtMcap(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000)     return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

function openWalletModal() {
  window.dispatchEvent(new CustomEvent("open-wallet-connect"));
}

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

// ─── Component ────────────────────────────────────────────────────────────────

export function TokenSwapArc({ launchId, tokenAddress, ticker, logoUrl }: Props) {
  const { walletAddress, selectedChain, isAuthenticated } = useAuth();

  const quoteSymbol = "USDC";

  const [direction,   setDirection]   = useState<Direction>("buy");
  const [amount,      setAmount]      = useState("");
  const [slippagePct, setSlippagePct] = useState(2);

  // Wallet MetaMask (indépendant de Supabase)
  const [mmAddress, setMmAddress] = useState<string | null>(null);

  // Balances
  const [quoteBalance,    setQuoteBalance]    = useState<bigint | null>(null);
  const [tokenBalance,    setTokenBalance]    = useState<bigint | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);

  // State on-chain (BondingCurveArcV2)
  const [graduated,     setGraduated]     = useState(false);
  const [reserveUsdc,   setReserveUsdc]   = useState<bigint>(BC_VIRTUAL_USDC);
  const [reserveTokens, setReserveTokens] = useState<bigint>(BC_CURVE_SUPPLY);
  const [realRaised,    setRealRaised]    = useState<bigint>(0n);
  const [progressBps,   setProgressBps]   = useState<bigint>(0n);

  // Quote
  const [estimatedOut, setEstimatedOut] = useState<bigint | null>(null);

  // Tx
  const [swapping, setSwapping] = useState(false);
  const [txHash,   setTxHash]   = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  // ── Provider EVM ─────────────────────────────────────────────────────────

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

  async function resolveActiveAddr(): Promise<`0x${string}` | null> {
    if (walletAddress) return walletAddress as `0x${string}`;
    try {
      const eth = getEth();
      const accounts: string[] = await eth.request({ method: "eth_accounts" });
      return accounts?.[0] ? (accounts[0] as `0x${string}`) : null;
    } catch { return null; }
  }

  function getPublicClient() {
    return createPublicClient({ chain: arc, transport: http("/api/arc-rpc") });
  }

  // ── Load on-chain state ───────────────────────────────────────────────────

  const loadState = useCallback(async () => {
    if (!launchId) return;
    try {
      const client = getPublicClient();
      const curveAddr = launchId as `0x${string}`;

      const [grad, resU, resT, raised, pbps] = await Promise.all([
        client.readContract({ address: curveAddr, abi: BONDING_CURVE_V2_ABI, functionName: "graduated" }) as Promise<boolean>,
        client.readContract({ address: curveAddr, abi: BONDING_CURVE_V2_ABI, functionName: "reserveUsdc" }) as Promise<bigint>,
        client.readContract({ address: curveAddr, abi: BONDING_CURVE_V2_ABI, functionName: "reserveTokens" }) as Promise<bigint>,
        client.readContract({ address: curveAddr, abi: BONDING_CURVE_V2_ABI, functionName: "realUsdcRaised" }) as Promise<bigint>,
        client.readContract({ address: curveAddr, abi: BONDING_CURVE_V2_ABI, functionName: "progressBps" }) as Promise<bigint>,
      ]);

      setGraduated(grad);
      setReserveUsdc(resU || BC_VIRTUAL_USDC);
      setReserveTokens(resT || BC_CURVE_SUPPLY);
      setRealRaised(raised);
      setProgressBps(pbps);
    } catch { /* ignore — contrat pas encore déployé */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchId]);

  const loadBalances = useCallback(async () => {
    const addr = (walletAddress ?? mmAddress) as `0x${string}` | null;
    if (!addr) { setQuoteBalance(null); setTokenBalance(null); return; }
    setBalancesLoading(true);
    try {
      const client = getPublicClient();
      const [quoteBal, tokBal] = await Promise.all([
        client.getBalance({ address: addr }),
        tokenAddress
          ? client.readContract({ address: tokenAddress as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] }) as Promise<bigint>
          : Promise.resolve(0n),
      ]);
      setQuoteBalance(quoteBal);
      setTokenBalance(tokBal);
    } catch { setQuoteBalance(null); setTokenBalance(null); }
    finally { setBalancesLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, mmAddress, tokenAddress]);

  // Détecter MetaMask indépendamment de Supabase
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (!eth) return;
    const sync = (accounts: string[]) => {
      setMmAddress(accounts[0] ?? null);
      if (accounts[0]) void loadBalances();
    };
    eth.request({ method: "eth_accounts" }).then((a: string[]) => sync(a)).catch(() => {});
    eth.on("accountsChanged", sync);
    return () => eth.removeListener("accountsChanged", sync);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadState(); }, [loadState]);
  useEffect(() => { void loadBalances(); }, [loadBalances]);

  // ── Quote client-side ─────────────────────────────────────────────────────

  useEffect(() => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setEstimatedOut(null); return; }
    try {
      if (direction === "buy") {
        const usdcGross = BigInt(Math.round(parsed * 1e18));
        const { tokensOut } = quoteArcBuy(reserveUsdc, reserveTokens, usdcGross, BC_FEE_BPS, BC_K);
        setEstimatedOut(tokensOut > 0n ? tokensOut : null);
      } else {
        const tokensIn = parseDecimalToBigInt(amount, 18);
        const { usdcOut } = quoteArcSell(reserveUsdc, reserveTokens, tokensIn, BC_FEE_BPS, BC_K);
        setEstimatedOut(usdcOut > 0n ? usdcOut : null);
      }
    } catch { setEstimatedOut(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, direction, reserveUsdc, reserveTokens]);

  // ── Arc chain switch ──────────────────────────────────────────────────────

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
    const parsed = parseFloat(amount);
    if (!amount || !estimatedOut || !parsed || parsed <= 0) return;

    const activeAddr = await resolveActiveAddr();
    if (!activeAddr) { setError("Connecte ton wallet pour swapper"); return; }
    if (!launchId)   { setError("Adresse de la courbe inconnue"); return; }

    setSwapping(true);
    setError(null);
    setTxHash(null);

    const curveAddr = launchId as `0x${string}`;
    const memeAddr  = tokenAddress as `0x${string}`;

    try {
      const eth = getEth();
      await ensureArcChain(eth);

      const slipMul = BigInt(Math.round((100 - slippagePct) * 10));

      if (direction === "buy") {
        const usdcGross  = BigInt(Math.round(parsed * 1e18));
        const minTokens  = (estimatedOut * slipMul) / 1000n;

        if (quoteBalance !== null && usdcGross > quoteBalance) throw new Error("Solde USDC insuffisant");

        // curve.buy{value: usdcGross}(minTokensOut)
        const data = encodeFunctionData({
          abi: BONDING_CURVE_V2_ABI, functionName: "buy", args: [minTokens],
        });
        const hash = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: activeAddr, to: curveAddr, data, value: `0x${usdcGross.toString(16)}` }],
        }) as string;
        setTxHash(hash);
        await waitReceipt(hash);

      } else {
        const tokensIn  = parseDecimalToBigInt(amount, 18);
        const minQuote  = (estimatedOut * slipMul) / 1000n;

        if (tokenBalance !== null && tokensIn > tokenBalance) throw new Error("Solde token insuffisant");

        // Approval si nécessaire
        const client = getPublicClient();
        const allowance = await client.readContract({
          address: memeAddr, abi: ERC20_ABI,
          functionName: "allowance", args: [activeAddr, curveAddr],
        }) as bigint;

        if (allowance < tokensIn) {
          const approveData = encodeFunctionData({
            abi: ERC20_ABI, functionName: "approve", args: [curveAddr, tokensIn * 2n],
          });
          const approveTx = await eth.request({
            method: "eth_sendTransaction",
            params: [{ from: activeAddr, to: memeAddr, data: approveData }],
          }) as string;
          await waitReceipt(approveTx);
        }

        // curve.sell(tokensIn, minUsdcOut)
        const sellData = encodeFunctionData({
          abi: BONDING_CURVE_V2_ABI, functionName: "sell", args: [tokensIn, minQuote],
        });
        const hash = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: activeAddr, to: curveAddr, data: sellData }],
        }) as string;
        setTxHash(hash);
        await waitReceipt(hash);
      }

      setAmount("");
      setEstimatedOut(null);
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

  const progressPct = BC_GRAD_THRESHOLD > 0n
    ? Math.min(100, Number((realRaised * 10000n) / BC_GRAD_THRESHOLD) / 100)
    : 0;

  // Market cap : (VIRTUAL_USDC + realRaised)² × totalSupply / (VIRTUAL_USDC × curveSupply)
  const TOTAL_SUPPLY_N  = 1_000_000_000n * 10n ** 18n;
  const currentMcapRaw  = (BC_VIRTUAL_USDC + realRaised) * (BC_VIRTUAL_USDC + realRaised) * TOTAL_SUPPLY_N / BC_K;
  const currentMcapUsdc = Number(currentMcapRaw) / 1e18;
  const GRAD_MCAP_USDC  = 3_000; // ≈$3K à graduation (2 000 USDC réels levés)

  const QuoteBadge = () => (
    <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-full px-3 py-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/usdc-coin.png" alt="USDC" className="size-5 rounded-full object-cover" />
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

        {/* Post-graduation */}
        {graduated && (
          <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 text-center">
            <p className="text-xs font-semibold text-indigo-400">🎓 Graduated — trade on Uniswap V4</p>
          </div>
        )}

        {/* Buy / Sell tabs */}
        {!graduated && (
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
        {!graduated && (
          <div className="space-y-1 px-0.5">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Bonding curve</span>
              <span>MC {fmtMcap(currentMcapUsdc)} / {fmtMcap(GRAD_MCAP_USDC)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all bg-blue-500"
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
            <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
              {(walletAddress || mmAddress)
                ? balancesLoading
                  ? <><Loader2 className="size-3 animate-spin" />Loading…</>
                  : `Balance: ${balFmt}`
                : "—"}
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
                  const portion = (inputBalance * BigInt(pct)) / 100n;
                  setAmount(bigintToInputString(portion, 18, direction === "buy" ? 2 : 4));
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

        {/* Fee */}
        {amount && parseFloat(amount) > 0 && direction === "buy" && (
          <div className="flex items-center justify-between px-1 pt-0.5">
            <span className="text-[11px] text-muted-foreground">Fee (2%)</span>
            <span className="text-[11px] text-muted-foreground">
              ~{(parseFloat(amount) * 0.02).toFixed(4)} {quoteSymbol}
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

        {!isAuthenticated && !mmAddress ? (
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
          Arc Network · Bonding Curve V2
        </p>
      </div>
    </div>
  );
}
