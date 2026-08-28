"use client";

/**
 * LaunchButton — guides the user through the on-chain pool creation.
 *
 * Two-transaction flow (prevents Phantom "Request blocked" warning):
 *
 *  TX 1 — Fee payment (simple SOL transfer → platform wallet)
 *    1a. Call /api/launchpad/[id]/prepare-fee-tx → get base64 fee tx
 *    1b. User signs (Phantom shows simple SOL transfer, no warning)
 *    1c. Broadcast fee tx
 *
 *  TX 2 — Pool creation (Meteora DBC, no SOL drain instruction)
 *    2a. Call /api/launchpad/[id]/prepare-tx → get base64 pool tx
 *    2b. User signs (clean tx, no SystemProgram.transfer)
 *    2c. Broadcast pool tx
 *    2d. Call /api/launchpad/[id]/confirm with pool tx signature
 *    2e. Redirect to /launchpad/[id]
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Transaction, PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { Loader2, Rocket, CheckCircle2, Clock } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | "ready"         // waiting for user to click
  | "fee-signing"   // TX1: requesting wallet signature for fee
  | "fee-sending"   // TX1: broadcasting fee tx
  | "signing"       // TX2: requesting wallet signature for pool tx
  | "sending"       // TX2: broadcasting pool tx
  | "confirming"    // waiting for backend confirm
  | "done"
  | "error";

type StatusResponse = {
  status: string;
  mintAddress: string | null;
  vanityReady: boolean;
  isScheduled: boolean;
  scheduledAt: string | null;
};

type SolanaWallet = {
  isPhantom?: boolean;
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (tx: Transaction, opts?: object) => Promise<{ signature: string }>;
  connect: () => Promise<{ publicKey: PublicKey }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWallet(): SolanaWallet | null {
  if (typeof window === "undefined") return null;
  const w = (window as unknown as { solana?: SolanaWallet }).solana;
  return w ?? null;
}

async function broadcastTx(signedTx: Transaction): Promise<string> {
  const RPCS = [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
    "https://rpc.ankr.com/solana",
  ];
  const { Connection } = await import("@solana/web3.js");
  for (const rpc of RPCS) {
    try {
      const conn = new Connection(rpc, "confirmed");
      const sig = await conn.sendRawTransaction(signedTx.serialize(), { maxRetries: 3 });
      return sig;
    } catch { /* try next RPC */ }
  }
  throw new Error("All RPCs failed — please try again");
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  tokenId: string;
  walletAddress: string;
  isScheduled: boolean;
};

export function LaunchButton({ tokenId, walletAddress, isScheduled }: Props) {
  const router = useRouter();
  const [phase, setPhase]             = useState<Phase>("ready");
  const [mintAddress, setMintAddress] = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  // Fetch mint address on mount
  useEffect(() => {
    fetch(`/api/launchpad/${tokenId}/status`)
      .then(r => r.json())
      .then((body: StatusResponse) => {
        if (body.mintAddress) setMintAddress(body.mintAddress);
        if (body.status === "active" || body.status === "graduated") setPhase("done");
      })
      .catch(() => {/* non-fatal */});
  }, [tokenId]);

  // ── Main launch flow ─────────────────────────────────────────────────────────
  const handleLaunch = useCallback(async () => {
    setError(null);

    const wallet = getWallet();
    if (!wallet) {
      toast.error("Phantom wallet not found. Install it at phantom.app");
      return;
    }

    // Ensure wallet is connected
    try {
      await wallet.connect();
    } catch {
      toast.error("Please connect your wallet first");
      return;
    }

    // Verify the connected wallet is the token creator
    const connectedAddress = wallet.publicKey?.toBase58();
    if (connectedAddress !== walletAddress) {
      toast.error(
        `Wrong wallet connected. Connect the creator wallet ending in …${walletAddress.slice(-6)}`
      );
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TX 1: Platform fee payment (simple SOL transfer)
    // This tx is clean — Phantom shows "Send 0.05 SOL to …" without any warning.
    // ─────────────────────────────────────────────────────────────────────────

    setPhase("fee-signing");

    let feeTxBase64: string;
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/prepare-fee-tx`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walletAddress }),
      });
      const body = await res.json() as { transactionBase64?: string; totalSol?: number; error?: string };
      if (!res.ok || !body.transactionBase64) {
        throw new Error(body.error ?? "Failed to prepare fee transaction");
      }
      feeTxBase64 = body.transactionBase64;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setPhase("error");
      toast.error(msg);
      return;
    }

    // Sign & send fee tx
    try {
      const feeTxBuffer = Buffer.from(feeTxBase64, "base64");
      const feeTx = Transaction.from(feeTxBuffer);

      if (wallet.signAndSendTransaction) {
        // Phantom native path
        await wallet.signAndSendTransaction(feeTx, { maxRetries: 3, preflightCommitment: "confirmed" });
      } else {
        setPhase("fee-sending");
        const signedFeeTx = await wallet.signTransaction(feeTx);
        await broadcastTx(signedFeeTx);
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Fee transaction failed";
      const isRejection = /rejected|cancel/i.test(raw);
      const msg = isRejection
        ? "Fee payment cancelled."
        : raw;
      setError(msg);
      setPhase("error");
      if (!isRejection) toast.error(msg);
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TX 2: Pool creation (Meteora DBC — no SOL drain, no Phantom warning)
    // ─────────────────────────────────────────────────────────────────────────

    setPhase("signing");

    let transactionBase64: string;
    let mint: string;
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/prepare-tx`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walletAddress }),
      });
      const body = await res.json() as { transactionBase64?: string; mintAddress?: string; error?: string };
      if (!res.ok || !body.transactionBase64) {
        throw new Error(body.error ?? "Failed to prepare pool transaction");
      }
      transactionBase64 = body.transactionBase64;
      mint = body.mintAddress ?? mintAddress ?? "";
      if (mint) setMintAddress(mint);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setPhase("error");
      toast.error(msg);
      return;
    }

    // Sign & send pool creation tx
    let txSignature: string;
    try {
      const txBuffer = Buffer.from(transactionBase64, "base64");
      const tx = Transaction.from(txBuffer);

      if (wallet.signAndSendTransaction) {
        const res = await wallet.signAndSendTransaction(tx, { maxRetries: 3, preflightCommitment: "confirmed" });
        setPhase("sending");
        txSignature = res.signature;
      } else {
        const signedTx = await wallet.signTransaction(tx);
        setPhase("sending");
        txSignature = await broadcastTx(signedTx);
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Transaction failed";
      const isRejection = /rejected|cancel/i.test(raw);
      const isExpired   = /blockhash|not found|expired/i.test(raw);
      const msg = isRejection && !isExpired
        ? "Pool creation cancelled."
        : isExpired
          ? "Transaction expired — click Retry to get a fresh one."
          : raw;
      setError(msg);
      setPhase("error");
      if (!isRejection || isExpired) toast.error(msg);
      return;
    }

    // ── Confirm with backend ──────────────────────────────────────────────────
    setPhase("confirming");
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/confirm`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ txSignature, walletAddress }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (res.status === 422) {
        setError("Transaction failed on-chain. Click Retry to try again.");
        setPhase("error");
        toast.error("Transaction failed on-chain — click Retry");
        return;
      }
      if (res.status === 202) {
        setError("Transaction pending… Wait a few seconds then click Retry.");
        setPhase("error");
        toast.info("Transaction pending — retry in a few seconds");
        return;
      }
      if (!res.ok || !body.ok) {
        console.error("Confirm sync error (non-fatal):", body.error);
        toast.warning(
          `Transaction sent! Sig: ${txSignature.slice(0, 8)}… — page will update automatically.`,
          { duration: 8000 }
        );
      }
    } catch (e) {
      console.error("Confirm error (non-fatal):", e);
      toast.warning(
        `Transaction sent! Sig: ${txSignature.slice(0, 8)}… — page will update automatically.`,
        { duration: 8000 }
      );
    }

    // ── Done ──────────────────────────────────────────────────────────────────
    setPhase("done");
    toast.success(
      isScheduled
        ? "Token created! It will be tradeable at the scheduled date."
        : "Token launched successfully!"
    );
    setTimeout(() => router.push(`/launchpad/${tokenId}`), 1500);
  }, [tokenId, walletAddress, mintAddress, isScheduled, router]);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (phase === "done") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-5" />
          <span className="text-sm font-semibold">
            {isScheduled ? "Scheduled! Coming soon." : "Launched successfully!"}
          </span>
        </div>
        {mintAddress && (
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Contract address (CA)</p>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(mintAddress); toast.success("CA copied!"); }}
              className="font-mono text-xs text-violet-600 dark:text-violet-400 break-all hover:underline text-left w-full"
              title="Click to copy"
            >
              {mintAddress}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
        <button
          type="button"
          onClick={() => { setError(null); setPhase("ready"); }}
          className="w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const busy = phase !== "ready";
  const label: Record<Phase, string> = {
    ready:       isScheduled ? "Sign & Schedule Launch" : "Sign & Launch 🚀",
    "fee-signing": "Step 1/2 — Approve platform fee…",
    "fee-sending": "Sending fee…",
    signing:     "Step 2/2 — Approve pool creation…",
    sending:     "Sending to network…",
    confirming:  "Confirming…",
    done:        "Done",
    error:       "Error",
  };

  return (
    <div className="space-y-4">
      {isScheduled && (
        <div className="flex items-center gap-2 rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-2.5 text-xs text-violet-700 dark:text-violet-300">
          <Clock className="size-3.5 shrink-0" />
          Token won&apos;t be tradeable until the scheduled launch date.
        </div>
      )}

      {/* Progress hint shown while signing */}
      {(phase === "fee-signing" || phase === "fee-sending") && (
        <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-2.5 text-xs text-blue-700 dark:text-blue-300">
          <span className="font-semibold">Signature 1 of 2:</span> Platform fee payment.
          Check your Phantom wallet.
        </div>
      )}
      {(phase === "signing" || phase === "sending") && (
        <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-2.5 text-xs text-violet-700 dark:text-violet-300">
          <span className="font-semibold">Signature 2 of 2:</span> Pool creation on Meteora.
          Check your Phantom wallet.
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={handleLaunch}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
        {label[phase]}
      </button>

      {/* Subtle hint below button */}
      {phase === "ready" && (
        <p className="text-center text-xs text-muted-foreground">
          You will sign 2 transactions: fee payment + pool creation.
        </p>
      )}
    </div>
  );
}
