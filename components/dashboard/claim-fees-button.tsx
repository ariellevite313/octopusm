"use client";

import { useState, useEffect } from "react";
import { Transaction, PublicKey } from "@solana/web3.js";
import { createWalletClient, custom, type WalletClient } from "viem";
import { toast } from "sonner";
import { Loader2, CoinsIcon } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { getProviderByType } from "@/lib/wallet/adapters";
import { arc } from "@/lib/arc-chain";

// ── ABI minimal BondingCurve Arc ──────────────────────────────────────────────
const CLAIM_FEES_ABI = [
  {
    name: "claimFees",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }],
    outputs: [],
  },
] as const;

type SolanaWallet = {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (tx: Transaction, opts?: object) => Promise<{ signature: string }>;
  connect: () => Promise<{ publicKey: PublicKey }>;
};

type Props = {
  tokenId: string;
  walletAddress: string;
  poolAddress: string;
  chain?: string;           // "arc" | "solana" | undefined
  arcCurveAddress?: string; // arc_launch_id — adresse BondingCurve sur Arc
  /** true = token graduated to DAMM V2 — fees come from locked LP */
  graduated?: boolean;
};

export function ClaimFeesButton({
  tokenId,
  walletAddress,
  poolAddress: _poolAddress,
  chain,
  arcCurveAddress,
  graduated = false,
}: Props) {
  const { walletType, selectedChain } = useAuth();
  const [phase, setPhase]           = useState<"idle" | "building" | "signing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg]     = useState("");
  const [claimable, setClaimable]   = useState<number | null>(null);
  const [feesUsd24h, setFeesUsd24h] = useState<number | null>(null);
  const [loadingAmt, setLoadingAmt] = useState(true);

  const isArc = chain === "arc";

  // Fetch claimable amount on mount
  useEffect(() => {
    fetch(`/api/launchpad/${tokenId}/claim-fees`)
      .then(r => r.json())
      .then((body: { claimableUsdc?: number | null; claimableSol?: number | null; feesUsd24h?: number | null }) => {
        // Arc returns claimableUsdc, Solana returns claimableSol
        const amount = body.claimableUsdc ?? body.claimableSol ?? null;
        setClaimable(amount);
        setFeesUsd24h(body.feesUsd24h ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingAmt(false));
  }, [tokenId]);

  // ── Arc claim (EVM / MetaMask) ─────────────────────────────────────────────
  async function handleClaimArc() {
    setPhase("building");
    setErrorMsg("");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (!eth) {
      toast.error("MetaMask not found — install it to claim fees");
      setPhase("idle");
      return;
    }

    try {
      await eth.request({ method: "eth_requestAccounts" });
    } catch {
      toast.error("Connect MetaMask first");
      setPhase("idle");
      return;
    }

    // Vérifier que le bon wallet est connecté
    const accounts: string[] = await eth.request({ method: "eth_accounts" });
    if (!accounts[0] || accounts[0].toLowerCase() !== walletAddress.toLowerCase()) {
      toast.error(`Wrong wallet — use the creator wallet …${walletAddress.slice(-6)}`);
      setPhase("idle");
      return;
    }

    const walletClient: WalletClient = createWalletClient({
      account:   walletAddress as `0x${string}`,
      chain:     arc,
      transport: custom(eth),
    });

    setPhase("signing");
    try {
      const curveAddr = (arcCurveAddress ?? "") as `0x${string}`;
      const txHash = await walletClient.writeContract({
        address:      curveAddr,
        abi:          CLAIM_FEES_ABI,
        functionName: "claimFees",
        args:         [walletAddress as `0x${string}`],
        gasPrice:     BigInt("20000000000"),
      });

      setPhase("done");
      const label = claimable !== null ? `${claimable.toFixed(6)} USDC claimed!` : "Fees claimed!";
      toast.success(`${label} — Tx: ${txHash.slice(0, 10)}…`);

      // Log non-bloquant
      fetch("/api/dashboard/log-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId, walletAddress, amountSol: claimable, txSignature: txHash }),
      }).catch(() => {});
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Transaction failed";
      const msg = /rejected|cancel/i.test(raw) ? "Transaction cancelled." : raw;
      setErrorMsg(msg);
      setPhase("error");
      if (!/rejected|cancel/i.test(raw)) toast.error(msg);
    }
  }

  // ── Solana claim (Phantom / Solflare / Backpack) ──────────────────────────
  async function handleClaimSolana() {
    setPhase("building");
    setErrorMsg("");

    const wallet = (walletType && selectedChain === "solana")
      ? getProviderByType(walletType) as unknown as SolanaWallet | null
      : null;

    if (!wallet) {
      toast.error("Solana wallet not found — connect Phantom, Solflare or Backpack");
      setPhase("idle");
      return;
    }

    try { await wallet.connect(); } catch {
      toast.error("Connect your wallet first");
      setPhase("idle");
      return;
    }

    if (wallet.publicKey?.toBase58() !== walletAddress) {
      toast.error(`Wrong wallet — use the creator wallet …${walletAddress.slice(-6)}`);
      setPhase("idle");
      return;
    }

    let txBase64: string;
    let claimableSol: number | null = null;
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/claim-fees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const body = await res.json() as { transactionBase64?: string; claimableSol?: number; error?: string };
      if (!res.ok || !body.transactionBase64) throw new Error(body.error ?? "Failed to build transaction");
      txBase64 = body.transactionBase64;
      claimableSol = body.claimableSol ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      setErrorMsg(msg);
      setPhase("error");
      toast.error(msg);
      return;
    }

    setPhase("signing");
    try {
      const tx = Transaction.from(Buffer.from(txBase64, "base64"));
      let sig = "";
      if (wallet.signAndSendTransaction) {
        const res = await wallet.signAndSendTransaction(tx);
        sig = res.signature;
      } else {
        const signed = await wallet.signTransaction(tx);
        const { Connection } = await import("@solana/web3.js");
        const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
        sig = await conn.sendRawTransaction(signed.serialize(), { maxRetries: 3 });
      }

      setPhase("done");
      const label = claimableSol !== null ? `${claimableSol.toFixed(6)} SOL claimed!` : "Fees claimed!";
      toast.success(`${label} — Sig: ${sig.slice(0, 8)}…`);

      if (claimableSol && claimableSol > 0) {
        fetch("/api/dashboard/log-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenId, walletAddress, amountSol: claimableSol, txSignature: sig }),
        }).catch(() => {});
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Transaction failed";
      const msg = /rejected|cancel/i.test(raw) ? "Transaction cancelled." : raw;
      setErrorMsg(msg);
      setPhase("error");
      if (!/rejected|cancel/i.test(raw)) toast.error(msg);
    }
  }

  // ── Dispatcher ─────────────────────────────────────────────────────────────
  async function handleClaim() {
    if (isArc) return handleClaimArc();
    return handleClaimSolana();
  }

  // ── Post-graduation Solana : lien Meteora si rien à claim DBC ─────────────
  if (!isArc && graduated && phase === "idle" && !loadingAmt && claimable !== null && claimable <= 0 && feesUsd24h === null) {
    return (
      <a
        href="https://app.meteora.ag"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline underline-offset-2"
      >
        <CoinsIcon className="size-3.5" />
        Claim fees on Meteora
      </a>
    );
  }

  if (phase === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        ✓ Fees claimed
      </span>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-500">{errorMsg}</span>
        <button type="button" onClick={() => setPhase("idle")} className="text-xs text-muted-foreground underline">
          Retry
        </button>
      </div>
    );
  }

  const busy  = phase === "building" || phase === "signing";
  const label = phase === "building" ? "Preparing…" : phase === "signing" ? "Signing…" : "Claim fees";
  const unit  = isArc ? "USDC" : "SOL";

  return (
    <div className="space-y-2">
      {/* Claimable amount */}
      <div className="flex items-center gap-1.5">
        <CoinsIcon className="size-3.5 text-muted-foreground shrink-0" />
        {loadingAmt ? (
          <span className="text-xs text-muted-foreground">Loading…</span>
        ) : claimable !== null ? (
          <span className="text-sm font-semibold text-foreground">
            {claimable.toFixed(6)} {unit}
            <span className="ml-1 text-xs font-normal text-muted-foreground">available</span>
          </span>
        ) : feesUsd24h !== null ? (
          <span className="text-sm font-semibold text-foreground">
            ~${feesUsd24h.toFixed(2)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">24h fees</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      <button
        type="button"
        disabled={busy || (claimable !== null && claimable <= 0)}
        onClick={handleClaim}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/70 disabled:opacity-50 transition-colors"
      >
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        {label}
      </button>
    </div>
  );
}
