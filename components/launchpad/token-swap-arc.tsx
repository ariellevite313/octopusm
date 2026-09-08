"use client";

/**
 * TokenSwapArc — widget buy/sell pour les tokens sur la courbe de bonding Arc.
 * Appelle directement BondingCurve.buy() / .sell() via MetaMask (window.ethereum).
 * Quotes calculés localement depuis reserveUsdc/reserveTokens lus on-chain.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createPublicClient, http, parseAbi, formatUnits, encodeFunctionData } from "viem";
import { Loader2, ArrowUpDown, CheckCircle2, ExternalLink } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";

// ─── Constants ────────────────────────────────────────────────────────────────

const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";
const ARC_CHAIN_ID    = 2468; // Arc testnet chain ID

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const USDC_DECIMALS = 6;
const TOKEN_DECIMALS = 18;

const FEE_BPS  = 200n;
const BPS      = 10_000n;
const VIRTUAL_USDC   = 3_200_000_000n;
const CURVE_SUPPLY   = 800_000_000n * 1_000_000_000_000_000_000n;
const GRAD_THRESHOLD = 4_800_000_000n;

const BONDING_CURVE_ABI = parseAbi([
  "function reserveUsdc() view returns (uint256)",
  "function reserveTokens() view returns (uint256)",
  "function realUsdcRaised() view returns (uint256)",
  "function graduated() view returns (bool)",
  "function creatorFeesAccrued() view returns (uint256)",
  "function graduationProgressBps() view returns (uint256)",
  "function buy(uint256 usdcIn, uint256 minTokensOut, address recipient) external",
  "function sell(uint256 tokensIn, uint256 minUsdcOut, address recipient) external",
  "function claimFees(address to) external",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
]);

const PCT_SHORTCUTS = [25, 50, 75, 100];
const SLIP_OPTIONS  = [
  { label: "1%",  bps: 100 },
  { label: "2%",  bps: 200 },
  { label: "5%",  bps: 500 },
];

type Direction = "buy" | "sell";

type Props = {
  curveAddress: string;  // arc_launch_id
  tokenAddress: string;  // mint_address (ERC-20)
  ticker:       string;
  logoUrl?:     string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUsdc(raw: bigint): string {
  return Number(formatUnits(raw, USDC_DECIMALS)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtTokens(raw: bigint): string {
  const n = Number(formatUnits(raw, TOKEN_DECIMALS));
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** Compute tokens out for a given USDC gross input (local formula = no RPC) */
function quoteBuy(
  usdcGross: bigint,
  reserveUsdc: bigint,
  reserveTokens: bigint,
): { tokensOut: bigint; fee: bigint; usdcNet: bigint } {
  const fee    = usdcGross * FEE_BPS / BPS;
  const usdcNet = usdcGross - fee;
  const newReserveUsdc   = reserveUsdc + usdcNet;
  const newReserveTokens = (reserveUsdc * reserveTokens) / newReserveUsdc;
  const tokensOut = reserveTokens > newReserveTokens
    ? reserveTokens - newReserveTokens
    : 0n;
  return { tokensOut, fee, usdcNet };
}

/** Compute USDC out for a given tokens in */
function quoteSell(
  tokensIn: bigint,
  reserveUsdc: bigint,
  reserveTokens: bigint,
): { usdcOut: bigint; fee: bigint } {
  const newReserveTokens = reserveTokens + tokensIn;
  const newReserveUsdc   = (reserveUsdc * reserveTokens) / newReserveTokens;
  const usdcGross = reserveUsdc > newReserveUsdc ? reserveUsdc - newReserveUsdc : 0n;
  const fee = usdcGross * FEE_BPS / BPS;
  return { usdcOut: usdcGross - fee, fee };
}

function openWalletModal() {
  window.dispatchEvent(new CustomEvent("open-wallet-connect"));
}

// ─── Public client (reads) ────────────────────────────────────────────────────

function getPublicClient() {
  return createPublicClient({
    transport: http(ARC_TESTNET_RPC),
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TokenSwapArc({ curveAddress, tokenAddress, ticker, logoUrl }: Props) {
  const { walletAddress, isAuthenticated } = useAuth();

  const curve  = curveAddress as `0x${string}`;
  const token  = tokenAddress as `0x${string}`;

  const [direction,   setDirection]   = useState<Direction>("buy");
  const [amount,      setAmount]      = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [showSlip,    setShowSlip]    = useState(false);
  const [activePct,   setActivePct]   = useState<number | null>(null);
  const [spinning,    setSpinning]    = useState(false);

  // On-chain state
  const [reserveUsdc,   setReserveUsdc]   = useState<bigint>(VIRTUAL_USDC);
  const [reserveTokens, setReserveTokens] = useState<bigint>(CURVE_SUPPLY);
  const [graduated,     setGraduated]     = useState(false);
  const [progressBps,   setProgressBps]   = useState(0n);
  const [chainLoading,  setChainLoading]  = useState(true);

  // Balances
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
  const [tokBalance,  setTokBalance]  = useState<bigint | null>(null);

  // Quote (computed locally)
  const [estimatedOut, setEstimatedOut] = useState<bigint | null>(null);

  // Tx state
  const [swapping,   setSwapping]   = useState(false);
  const [txHash,     setTxHash]     = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const isBuy = direction === "buy";
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Read on-chain state ─────────────────────────────────────────────────────

  const refreshChainState = useCallback(async () => {
    const client = getPublicClient();
    try {
      const [rUsdc, rTok, grad, prog] = await Promise.all([
        client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "reserveUsdc" }),
        client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "reserveTokens" }),
        client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "graduated" }),
        client.readContract({ address: curve, abi: BONDING_CURVE_ABI, functionName: "graduationProgressBps" }),
      ]);
      setReserveUsdc(rUsdc);
      setReserveTokens(rTok);
      setGraduated(grad);
      setProgressBps(prog);
    } catch {
      // ignore RPC errors — keep stale state
    } finally {
      setChainLoading(false);
    }
  }, [curve]);

  useEffect(() => {
    void refreshChainState();
  }, [refreshChainState]);

  // ── Read balances ───────────────────────────────────────────────────────────

  const refreshBalances = useCallback(async () => {
    if (!walletAddress) { setUsdcBalance(null); setTokBalance(null); return; }
    const addr = walletAddress as `0x${string}`;
    const client = getPublicClient();
    try {
      const [u, t] = await Promise.all([
        client.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] }),
        client.readContract({ address: token,        abi: ERC20_ABI, functionName: "balanceOf", args: [addr] }),
      ]);
      setUsdcBalance(u);
      setTokBalance(t);
    } catch {
      // ignore
    }
  }, [walletAddress, token]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  // ── Compute quote locally ───────────────────────────────────────────────────

  useEffect(() => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0 || isNaN(parsed) || chainLoading) {
      setEstimatedOut(null);
      return;
    }
    try {
      if (isBuy) {
        const usdcIn = BigInt(Math.round(parsed * 1e6));
        const { tokensOut } = quoteBuy(usdcIn, reserveUsdc, reserveTokens);
        setEstimatedOut(tokensOut);
      } else {
        const tokIn = BigInt(Math.round(parsed * 1e18));
        const { usdcOut } = quoteSell(tokIn, reserveUsdc, reserveTokens);
        setEstimatedOut(usdcOut);
      }
    } catch {
      setEstimatedOut(null);
    }
  }, [amount, isBuy, reserveUsdc, reserveTokens, chainLoading]);

  // ── Toggle direction ─────────────────────────────────────────────────────────

  const toggleDirection = () => {
    setSpinning(true);
    setTimeout(() => setSpinning(false), 400);
    setDirection(d => d === "buy" ? "sell" : "buy");
    setAmount("");
    setActivePct(null);
    setEstimatedOut(null);
    setError(null);
    setTxHash(null);
  };

  // ── EVM helpers (window.ethereum) ────────────────────────────────────────────

  async function getEth() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("MetaMask not found");
    return eth;
  }

  async function ensureArcNetwork() {
    const eth = await getEth();
    const chainHex = await eth.request({ method: "eth_chainId" }) as string;
    const chainId  = parseInt(chainHex, 16);
    if (chainId !== ARC_CHAIN_ID) {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${ARC_CHAIN_ID.toString(16)}` }],
      });
    }
  }

  async function approveIfNeeded(spender: `0x${string}`, amountNeeded: bigint) {
    if (!walletAddress) return;
    const addr   = walletAddress as `0x${string}`;
    const client = getPublicClient();
    const allowance = await client.readContract({
      address: USDC_ADDRESS,
      abi:     ERC20_ABI,
      functionName: "allowance",
      args:    [addr, spender],
    });
    if (allowance >= amountNeeded) return; // already approved

    const eth = await getEth();
    const data = encodeApprove(spender, amountNeeded);
    const txHash = await eth.request({
      method: "eth_sendTransaction",
      params: [{
        from:  walletAddress,
        to:    USDC_ADDRESS,
        data,
      }],
    }) as string;
    // Wait for approval tx
    await waitForReceipt(txHash);
  }

  async function approveTokenIfNeeded(spender: `0x${string}`, amountNeeded: bigint) {
    if (!walletAddress) return;
    const addr   = walletAddress as `0x${string}`;
    const client = getPublicClient();
    const allowance = await client.readContract({
      address: token,
      abi:     ERC20_ABI,
      functionName: "allowance",
      args:    [addr, spender],
    });
    if (allowance >= amountNeeded) return;

    const eth = await getEth();
    const data = encodeApprove(spender, amountNeeded);
    const txHash = await eth.request({
      method: "eth_sendTransaction",
      params: [{
        from:  walletAddress,
        to:    token,
        data,
      }],
    }) as string;
    await waitForReceipt(txHash);
  }

  async function waitForReceipt(hash: string, attempts = 60, intervalMs = 3000) {
    const client = getPublicClient();
    for (let i = 0; i < attempts; i++) {
      await new Promise(r => setTimeout(r, intervalMs));
      const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
      if (receipt) return receipt;
    }
    throw new Error("Transaction not confirmed");
  }

  // ── ABI encoders (via viem encodeFunctionData — pas de sélecteur hardcodé) ──

  function encodeApprove(spender: `0x${string}`, amount: bigint): `0x${string}` {
    return encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, amount] });
  }

  function encodeBuy(usdcIn: bigint, minTokens: bigint, recipient: `0x${string}`): `0x${string}` {
    return encodeFunctionData({ abi: BONDING_CURVE_ABI, functionName: "buy", args: [usdcIn, minTokens, recipient] });
  }

  function encodeSell(tokensIn: bigint, minUsdc: bigint, recipient: `0x${string}`): `0x${string}` {
    return encodeFunctionData({ abi: BONDING_CURVE_ABI, functionName: "sell", args: [tokensIn, minUsdc, recipient] });
  }

  // ── Swap ──────────────────────────────────────────────────────────────────

  const handleSwap = async () => {
    if (!walletAddress || !amount) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;

    setSwapping(true);
    setError(null);
    setTxHash(null);

    try {
      await ensureArcNetwork();

      const eth = await getEth();

      if (isBuy) {
        const usdcIn = BigInt(Math.round(parsed * 1e6));

        // Balance check
        if (usdcBalance !== null && usdcIn > usdcBalance) {
          throw new Error("Insufficient USDC balance");
        }

        // Compute min tokens with slippage
        const { tokensOut } = quoteBuy(usdcIn, reserveUsdc, reserveTokens);
        const minTokens = tokensOut * BigInt(10_000 - slippageBps) / 10_000n;

        // Approve USDC
        await approveIfNeeded(curve, usdcIn);

        // Send buy tx
        const data = encodeBuy(usdcIn, minTokens, walletAddress as `0x${string}`);
        const hash = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: walletAddress, to: curve, data }],
        }) as string;

        setTxHash(hash);
        const receipt = await waitForReceipt(hash);
        if (receipt.status === "0x0") throw new Error("Transaction reverted");

      } else {
        const tokensIn = BigInt(Math.round(parsed * 1e18));

        // Balance check
        if (tokBalance !== null && tokensIn > tokBalance) {
          throw new Error(`Insufficient ${ticker} balance`);
        }

        // Compute min USDC with slippage
        const { usdcOut } = quoteSell(tokensIn, reserveUsdc, reserveTokens);
        const minUsdc = usdcOut * BigInt(10_000 - slippageBps) / 10_000n;

        // Approve token
        await approveTokenIfNeeded(curve, tokensIn);

        // Send sell tx
        const data = encodeSell(tokensIn, minUsdc, walletAddress as `0x${string}`);
        const hash = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: walletAddress, to: curve, data }],
        }) as string;

        setTxHash(hash);
        const receipt = await waitForReceipt(hash);
        if (receipt.status === "0x0") throw new Error("Transaction reverted");
      }

      // Refresh state
      setAmount("");
      setActivePct(null);
      setEstimatedOut(null);
      if (refreshRef.current) clearTimeout(refreshRef.current);
      refreshRef.current = setTimeout(async () => {
        await Promise.all([refreshChainState(), refreshBalances()]);
      }, 2000);

    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setError(
        msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel")
          ? "Transaction cancelled"
          : msg,
      );
    } finally {
      setSwapping(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const progressPct = Number(progressBps) / 100;

  const activeBalanceFmt = isBuy
    ? (usdcBalance !== null ? `${fmtUsdc(usdcBalance)} USDC` : "—")
    : (tokBalance  !== null ? `${fmtTokens(tokBalance)} ${ticker}` : "—");

  const outFormatted = estimatedOut != null && estimatedOut > 0n
    ? isBuy
      ? `~${fmtTokens(estimatedOut)} ${ticker}`
      : `~${fmtUsdc(estimatedOut)} USDC`
    : "";

  const canSwap = !!amount && parseFloat(amount) > 0 && !swapping && !graduated && !chainLoading;

  const ctaLabel = graduated
    ? "Graduated — trade on Uniswap"
    : !amount
      ? "Enter an amount"
      : isBuy ? `Buy $${ticker}` : `Sell $${ticker}`;

  // ── Render ───────────────────────────────────────────────────────────────────

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

  const UsdcBadge = () => (
    <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-full px-3 py-1.5">
      <div className="size-5 rounded-full bg-blue-400 flex items-center justify-center text-[8px] font-bold text-white">$</div>
      <span className="text-[13px] font-semibold text-foreground">USDC</span>
    </div>
  );

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card">
      <div className="p-4 space-y-2">

        {/* ── Graduation progress bar ── */}
        {!graduated && (
          <div className="space-y-1.5 pb-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Bonding curve</span>
              <span>{progressPct.toFixed(1)}% to graduation</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-500"
                style={{ width: `${Math.min(progressPct, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Graduated banner ── */}
        {graduated && (
          <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 text-center">
            <p className="text-xs font-semibold text-indigo-400">🎓 Graduated — trade on Uniswap V2</p>
          </div>
        )}

        {/* ── Pay box ── */}
        <div className="rounded-2xl bg-muted/40 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-muted-foreground font-medium">You pay</p>
          <input
            type="number"
            value={amount}
            onChange={e => { setAmount(e.target.value); setActivePct(null); }}
            placeholder="0"
            disabled={graduated || swapping}
            className="w-full bg-transparent text-[28px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/30 disabled:opacity-50"
          />
          <div className="flex items-center justify-between mt-1">
            {isBuy ? <UsdcBadge /> : <TokenBadge />}
            <span className="text-[11px] text-muted-foreground/60">
              {walletAddress ? `Balance: ${activeBalanceFmt}` : "—"}
            </span>
          </div>
        </div>

        {/* ── Arrow toggle ── */}
        <div className="flex justify-center -my-1 relative z-10">
          <button
            onClick={toggleDirection}
            disabled={graduated || swapping}
            className="size-9 rounded-full bg-muted border-2 border-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            style={{ transform: spinning ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.35s ease" }}
          >
            <ArrowUpDown className="size-4" />
          </button>
        </div>

        {/* ── Receive box ── */}
        <div className="rounded-2xl bg-muted/40 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-muted-foreground font-medium">You receive</p>
          <div className="min-h-[40px] flex items-center">
            {chainLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : outFormatted ? (
              <span className="text-[28px] font-semibold text-foreground">{outFormatted}</span>
            ) : (
              <span className="text-[28px] font-semibold text-muted-foreground/30">0</span>
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            {isBuy ? <TokenBadge /> : <UsdcBadge />}
            <span className="text-[11px] text-muted-foreground/60">estimated · 2% fee</span>
          </div>
        </div>

        {/* ── % shortcuts ── */}
        {!graduated && (
          <div className="flex gap-2 pt-1">
            {PCT_SHORTCUTS.map(pct => (
              <button
                key={pct}
                onClick={() => {
                  setActivePct(pct);
                  const base = isBuy
                    ? Number(usdcBalance ?? 0n) / 1e6
                    : Number(tokBalance  ?? 0n) / 1e18;
                  setAmount(((base * pct) / 100).toFixed(isBuy ? 2 : 6));
                }}
                className={`flex-1 py-2 rounded-full text-[12px] font-semibold transition-colors border ${
                  activePct === pct
                    ? "bg-blue-500 border-blue-500 text-white"
                    : "bg-muted/40 border-border text-muted-foreground hover:border-border-strong hover:text-foreground"
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        )}

        {/* ── Slippage ── */}
        {!graduated && (
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-[12px] text-muted-foreground">Slippage</span>
            <button
              onClick={() => setShowSlip(s => !s)}
              className="flex items-center gap-1.5 bg-muted/50 hover:bg-muted rounded-full px-3 py-1 transition-colors"
            >
              <span className="text-[12px] font-medium text-foreground/70">
                {SLIP_OPTIONS.find(o => o.bps === slippageBps)?.label ?? "1%"}
              </span>
            </button>
          </div>
        )}

        {showSlip && (
          <div className="flex gap-2 px-1">
            {SLIP_OPTIONS.map(opt => (
              <button
                key={opt.bps}
                onClick={() => { setSlippageBps(opt.bps); setShowSlip(false); }}
                className={`flex-1 py-1.5 rounded-full text-[12px] font-semibold transition-colors border ${
                  slippageBps === opt.bps
                    ? "bg-blue-500 border-blue-500 text-white"
                    : "bg-muted/40 border-border text-muted-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && <p className="text-[11px] text-red-400 text-center">{error}</p>}

        {/* ── Success ── */}
        {txHash && (
          <a
            href={`https://testnet.arcscan.app/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-400 hover:underline"
          >
            <CheckCircle2 className="size-3.5" />
            Confirmed — View on ArcScan
            <ExternalLink className="size-3" />
          </a>
        )}

        {/* ── CTA ── */}
        {!isAuthenticated ? (
          <button
            onClick={openWalletModal}
            className="w-full rounded-full py-4 text-[15px] font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-colors mt-1"
          >
            Connect wallet
          </button>
        ) : (
          <button
            onClick={() => void handleSwap()}
            disabled={!canSwap}
            className={`w-full rounded-full py-4 text-[15px] font-semibold transition-colors mt-1 ${
              !canSwap
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : isBuy
                  ? "bg-blue-500 hover:bg-blue-400 text-white"
                  : "bg-violet-600 hover:bg-violet-500 text-white"
            }`}
          >
            {swapping ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {isBuy ? "Buying…" : "Selling…"}
              </span>
            ) : ctaLabel}
          </button>
        )}

        <p className="text-center text-[10px] text-muted-foreground/40 pb-1">
          Arc Network · Bonding curve
        </p>

      </div>
    </div>
  );
}
