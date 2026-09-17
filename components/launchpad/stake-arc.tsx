"use client";

/**
 * StakeArc — Stake & Earn widget for V4 tokens with holder fee distribution.
 *
 * Only renders when the token has a FeeDistributor deployed
 * (getCurveState().feeDistributor !== address(0)).
 *
 * Flow:
 *   1. Holder approves meme token → FeeDistributor
 *   2. Holder calls stake(amount) → starts earning USDC on every swap
 *   3. USDC accumulates via rewardPerTokenStored (updated by notifyReward per swap)
 *   4. Holder calls claim() to pull accumulated USDC
 *   5. Or exit() to unstake all + claim in one TX
 */

import { useState, useEffect, useCallback } from "react";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
} from "viem";
import { Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import {
  ARC_HOOK_ADDRESS,
  BONDING_CURVE_HOOK_ABI,
  FEE_DISTRIBUTOR_ABI,
  ERC20_APPROVE_ABI,
  getArcV4PoolId,
} from "@/lib/arc-launchpad";
import { arc } from "@/lib/arc-chain";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  tokenAddress: string; // meme ERC-20 address (= mint_address in V4)
  ticker:       string;
  logoUrl?:     string;
};

type Tab = "stake" | "unstake";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtUsdc(raw: bigint): string {
  return (Number(raw) / 1e6).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
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

function bigintToInputString(raw: bigint, decimals: number, maxFrac = 4): string {
  const divisor = BigInt(10 ** decimals);
  const intPart  = raw / divisor;
  const fracPart = raw % divisor;
  if (fracPart === 0n) return intPart.toString();
  const fracStr = fracPart
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFrac)
    .replace(/0+$/, "");
  return fracStr ? `${intPart}.${fracStr}` : intPart.toString();
}

const ERC20_BALANCE_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const RPC = "https://rpc.mainnet.arc.io";

function getPublicClient() {
  return createPublicClient({ chain: arc, transport: http(RPC) });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StakeArc({ tokenAddress, ticker, logoUrl }: Props) {
  const { walletAddress, isAuthenticated, selectedChain } = useAuth();

  // FeeDistributor address — null until loaded, stays null if not deployed
  const [distributor, setDistributor] = useState<`0x${string}` | null>(null);
  const [loading,     setLoading]     = useState(true);

  const [tab,    setTab]    = useState<Tab>("stake");
  const [amount, setAmount] = useState("");

  // On-chain balances
  const [tokenBalance,  setTokenBalance]  = useState<bigint>(0n);
  const [stakedAmount,  setStakedAmount]  = useState<bigint>(0n);
  const [claimableUsdc, setClaimableUsdc] = useState<bigint>(0n);
  const [totalStaked,   setTotalStaked]   = useState<bigint>(0n);

  // TX state
  const [pending,  setPending]  = useState(false);
  const [txHash,   setTxHash]   = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  // ── 1. Load FeeDistributor address from hook ─────────────────────────────

  useEffect(() => {
    if (!ARC_HOOK_ADDRESS) { setLoading(false); return; }

    const client = getPublicClient();
    const poolId = getArcV4PoolId(tokenAddress as `0x${string}`);

    client
      .readContract({
        address:      ARC_HOOK_ADDRESS,
        abi:          BONDING_CURVE_HOOK_ABI,
        functionName: "getCurveState",
        args:         [poolId],
      })
      .then((state) => {
        const s = state as { feeDistributor: `0x${string}` };
        if (s.feeDistributor && s.feeDistributor !== ZERO_ADDR) {
          setDistributor(s.feeDistributor);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tokenAddress]);

  // ── 2. Load balances ──────────────────────────────────────────────────────

  const loadBalances = useCallback(async () => {
    if (!distributor || !walletAddress) return;
    const client = getPublicClient();
    const addr   = walletAddress as `0x${string}`;

    try {
      const [bal, staked, claimable, total] = await Promise.all([
        client.readContract({
          address: tokenAddress as `0x${string}`,
          abi:     ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [addr],
        }) as Promise<bigint>,
        client.readContract({
          address:      distributor,
          abi:          FEE_DISTRIBUTOR_ABI,
          functionName: "staked",
          args:         [addr],
        }) as Promise<bigint>,
        client.readContract({
          address:      distributor,
          abi:          FEE_DISTRIBUTOR_ABI,
          functionName: "claimable",
          args:         [addr],
        }) as Promise<bigint>,
        client.readContract({
          address:      distributor,
          abi:          FEE_DISTRIBUTOR_ABI,
          functionName: "totalStaked",
        }) as Promise<bigint>,
      ]);
      setTokenBalance(bal);
      setStakedAmount(staked);
      setClaimableUsdc(claimable);
      setTotalStaked(total);
    } catch { /* ignore */ }
  }, [distributor, walletAddress, tokenAddress]);

  useEffect(() => { void loadBalances(); }, [loadBalances]);

  // ── 3. Provider helpers ───────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getEth(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    let eth = w.ethereum;
    if (Array.isArray(eth?.providers)) {
      eth = eth.providers.find(
        (p: { isMetaMask?: boolean; isPhantom?: boolean }) =>
          p.isMetaMask && !p.isPhantom
      ) ?? eth;
    }
    if (!eth) throw new Error("MetaMask not found");
    return eth;
  }

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
          await e.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x13B2", chainName: "Arc",
              nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
              rpcUrls: ["https://rpc.mainnet.arc.io"],
              blockExplorerUrls: ["https://explorer.arc.io"],
            }],
          });
        } else throw err;
      });
    }
  }

  async function waitReceipt(hash: string) {
    const client = getPublicClient();
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const r = await client
        .getTransactionReceipt({ hash: hash as `0x${string}` })
        .catch(() => null);
      if (r) return r;
    }
    return null;
  }

  function handleError(e: unknown) {
    const msg = e instanceof Error ? e.message : "Transaction failed";
    setError(
      msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel")
        ? "Transaction cancelled"
        : msg
    );
  }

  // ── 4. Actions ────────────────────────────────────────────────────────────

  const handleStake = async () => {
    if (!walletAddress || !distributor || !amount) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;

    setPending(true);
    setError(null);
    setTxHash(null);

    try {
      const eth = getEth();
      await ensureArcChain(eth);
      const client   = getPublicClient();
      const stakeAmt = parseDecimalToBigInt(amount, 18);
      const addr     = walletAddress as `0x${string}`;

      if (stakeAmt > tokenBalance) throw new Error("Insufficient token balance");

      // Approve if needed
      const allowance = await client.readContract({
        address:      tokenAddress as `0x${string}`,
        abi:          ERC20_BALANCE_ABI,
        functionName: "allowance",
        args:         [addr, distributor],
      }) as bigint;

      if (allowance < stakeAmt) {
        const approveData = encodeFunctionData({
          abi: ERC20_APPROVE_ABI, functionName: "approve",
          args: [distributor, stakeAmt * 2n],
        });
        const approveTx = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: addr, to: tokenAddress, data: approveData }],
        }) as string;
        await waitReceipt(approveTx);
      }

      // Stake
      const data = encodeFunctionData({
        abi: FEE_DISTRIBUTOR_ABI, functionName: "stake", args: [stakeAmt],
      });
      const hash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: addr, to: distributor, data }],
      }) as string;
      setTxHash(hash);
      await waitReceipt(hash);

      setAmount("");
      [1500, 3000].forEach(ms => setTimeout(() => void loadBalances(), ms));
    } catch (e) { handleError(e); }
    finally { setPending(false); }
  };

  const handleUnstake = async () => {
    if (!walletAddress || !distributor || !amount) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;

    setPending(true);
    setError(null);
    setTxHash(null);

    try {
      const eth       = getEth();
      await ensureArcChain(eth);
      const unstakeAmt = parseDecimalToBigInt(amount, 18);
      const addr       = walletAddress as `0x${string}`;

      if (unstakeAmt > stakedAmount) throw new Error("Insufficient staked balance");

      const data = encodeFunctionData({
        abi: FEE_DISTRIBUTOR_ABI, functionName: "unstake", args: [unstakeAmt],
      });
      const hash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: addr, to: distributor, data }],
      }) as string;
      setTxHash(hash);
      await waitReceipt(hash);

      setAmount("");
      [1500, 3000].forEach(ms => setTimeout(() => void loadBalances(), ms));
    } catch (e) { handleError(e); }
    finally { setPending(false); }
  };

  const handleClaim = async () => {
    if (!walletAddress || !distributor || claimableUsdc === 0n) return;

    setPending(true);
    setError(null);
    setTxHash(null);

    try {
      const eth  = getEth();
      await ensureArcChain(eth);
      const addr = walletAddress as `0x${string}`;

      const data = encodeFunctionData({
        abi: FEE_DISTRIBUTOR_ABI, functionName: "claim", args: [],
      });
      const hash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: addr, to: distributor, data }],
      }) as string;
      setTxHash(hash);
      await waitReceipt(hash);

      [1500, 3000].forEach(ms => setTimeout(() => void loadBalances(), ms));
    } catch (e) { handleError(e); }
    finally { setPending(false); }
  };

  const handleExit = async () => {
    if (!walletAddress || !distributor) return;

    setPending(true);
    setError(null);
    setTxHash(null);

    try {
      const eth  = getEth();
      await ensureArcChain(eth);
      const addr = walletAddress as `0x${string}`;

      const data = encodeFunctionData({
        abi: FEE_DISTRIBUTOR_ABI, functionName: "exit", args: [],
      });
      const hash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: addr, to: distributor, data }],
      }) as string;
      setTxHash(hash);
      await waitReceipt(hash);

      setAmount("");
      [1500, 3000].forEach(ms => setTimeout(() => void loadBalances(), ms));
    } catch (e) { handleError(e); }
    finally { setPending(false); }
  };

  // ── 5. Render ─────────────────────────────────────────────────────────────

  // Still loading or no distributor — don't render anything
  if (loading || !distributor) return null;

  // Arc tokens require an Arc (EVM) wallet
  if (isAuthenticated && selectedChain !== "arc") {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-6 text-center space-y-2">
        <p className="text-sm font-semibold text-foreground">🎁 Stake & Earn</p>
        <p className="text-xs text-muted-foreground">
          Connect an EVM wallet (MetaMask, Rabby…) to stake.
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

  const inputBalance  = tab === "stake" ? tokenBalance : stakedAmount;
  const inputBalFmt   = `${fmtTokens(inputBalance)} $${ticker}`;
  const shareOfPool   = totalStaked > 0n
    ? ((stakedAmount * 10000n) / totalStaked)
    : 0n;
  const shareStr      = totalStaked > 0n && stakedAmount > 0n
    ? `${(Number(shareOfPool) / 100).toFixed(2)}%`
    : "0%";

  const canStake   = tab === "stake"   && !!amount && parseFloat(amount) > 0 && !pending;
  const canUnstake = tab === "unstake" && !!amount && parseFloat(amount) > 0 && !pending;
  const canClaim   = claimableUsdc > 0n && !pending;
  const canExit    = (stakedAmount > 0n || claimableUsdc > 0n) && !pending;

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card">
      <div className="p-4 space-y-3">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🎁</span>
            <p className="text-sm font-semibold text-foreground">Stake & Earn</p>
          </div>
          <p className="text-[11px] text-muted-foreground">Earn USDC from every trade</p>
        </div>

        {/* Claimable USDC — always visible if non-zero */}
        {claimableUsdc > 0n && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-emerald-400 font-medium">Claimable rewards</p>
              <p className="text-lg font-bold text-emerald-400">${fmtUsdc(claimableUsdc)}</p>
              <p className="text-[10px] text-emerald-400/60">USDC</p>
            </div>
            <button
              onClick={() => void handleClaim()}
              disabled={!canClaim || !isAuthenticated}
              className="px-4 py-2 rounded-full text-[13px] font-semibold bg-emerald-500 hover:bg-emerald-400 text-white transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Claim"}
            </button>
          </div>
        )}

        {/* Stats row */}
        {(stakedAmount > 0n || totalStaked > 0n) && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-muted/40 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Your stake</p>
              <p className="text-sm font-semibold text-foreground">{fmtTokens(stakedAmount)}</p>
              <p className="text-[10px] text-muted-foreground/60">${ticker}</p>
            </div>
            <div className="rounded-xl bg-muted/40 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Pool share</p>
              <p className="text-sm font-semibold text-foreground">{shareStr}</p>
              <p className="text-[10px] text-muted-foreground/60">of {fmtTokens(totalStaked)} staked</p>
            </div>
          </div>
        )}

        {/* Stake / Unstake tabs */}
        <div className="flex rounded-xl overflow-hidden border border-border">
          {(["stake", "unstake"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setAmount(""); setTxHash(null); setError(null); }}
              className={`flex-1 py-2 text-[13px] font-semibold transition-colors capitalize ${
                tab === t
                  ? t === "stake"
                    ? "bg-violet-500 text-white"
                    : "bg-orange-500 text-white"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Amount input */}
        <div className="rounded-2xl bg-muted/40 px-4 py-3.5 space-y-1">
          <p className="text-[12px] text-muted-foreground font-medium">
            {tab === "stake" ? "Amount to stake" : "Amount to unstake"}
          </p>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            disabled={pending}
            className="w-full bg-transparent text-[28px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/30 disabled:opacity-50"
          />
          <div className="flex items-center justify-between mt-1">
            {/* Token badge */}
            <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-full px-3 py-1.5">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={ticker} className="size-5 rounded-full object-cover" />
              ) : (
                <div className="size-5 rounded-full bg-violet-500/80 flex items-center justify-center text-[8px] font-bold text-white">
                  {ticker.slice(0, 1)}
                </div>
              )}
              <span className="text-[13px] font-semibold text-foreground">${ticker}</span>
            </div>
            <span className="text-[11px] text-muted-foreground/60">
              {walletAddress ? `Balance: ${inputBalFmt}` : "—"}
            </span>
          </div>
        </div>

        {/* % shortcuts */}
        <div className="flex gap-2">
          {[25, 50, 75, 100].map(pct => (
            <button
              key={pct}
              onClick={() => {
                const portion = (inputBalance * BigInt(pct)) / 100n;
                setAmount(bigintToInputString(portion, 18));
              }}
              className="flex-1 py-2 rounded-full text-[12px] font-semibold border bg-muted/40 border-border text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors"
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* Error */}
        {error && <p className="text-[11px] text-red-400 text-center">{error}</p>}

        {/* TX link */}
        {txHash && (
          <a
            href={`https://explorer.arc.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-400 hover:underline"
          >
            <CheckCircle2 className="size-3.5" />
            Confirmed — ArcScan
            <ExternalLink className="size-3" />
          </a>
        )}

        {/* Action button */}
        {!isAuthenticated ? (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
            className="w-full rounded-md py-2.5 text-[15px] font-semibold bg-orange-500 hover:bg-orange-400 text-white transition-colors"
          >
            Connect wallet
          </button>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => void (tab === "stake" ? handleStake() : handleUnstake())}
              disabled={tab === "stake" ? !canStake : !canUnstake}
              className={`w-full rounded-md py-3.5 text-[15px] font-semibold transition-colors ${
                tab === "stake"
                  ? canStake
                    ? "bg-violet-500 hover:bg-violet-400 text-white"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                  : canUnstake
                    ? "bg-orange-500 hover:bg-orange-400 text-white"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {pending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  {tab === "stake" ? "Staking…" : "Unstaking…"}
                </span>
              ) : tab === "stake" ? `Stake $${ticker}` : `Unstake $${ticker}`}
            </button>

            {/* Exit button — only shown when user has stake or claimable */}
            {canExit && (
              <button
                onClick={() => void handleExit()}
                disabled={pending}
                className="w-full rounded-md py-2.5 text-[13px] font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors disabled:opacity-50"
              >
                {pending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-3.5 animate-spin" />
                    Exiting…
                  </span>
                ) : "Exit (unstake all + claim)"}
              </button>
            )}
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground/40 pb-1">
          Arc Network · Uniswap V4 · Holder Rewards
        </p>
      </div>
    </div>
  );
}
