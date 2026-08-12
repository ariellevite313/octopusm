"use client";

/**
 * LaunchButton — guides the user through the on-chain pool creation:
 *
 *  1. Call /api/launchpad/[id]/prepare-tx → get base64 transaction
 *  2. Deserialize + sign with user wallet (via window.solana / Phantom)
 *  3. Send to network
 *  4. Call /api/launchpad/[id]/confirm with the tx signature
 *  5. Redirect to /launchpad/[id]
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Transaction, PublicKey } from "@solana/web3.js";
// Connection is no longer imported client-side — broadcasting goes via /api/launchpad/[id]/send-tx
import { toast } from "sonner";
import { Loader2, Rocket, CheckCircle2, Clock } from "lucide-react";
// Clock kept for scheduled launch indicator

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | "ready"         // mint ready, waiting for user to click
  | "signing"       // requesting wallet signature
  | "sending"       // submitting tx to network
  | "confirming"    // waiting for backend confirm
  | "done"          // success
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

    // ── Step 1: get the partially-signed transaction from the server ───────────
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
        throw new Error(body.error ?? "Failed to prepare transaction");
      }
      transactionBase64 = body.transactionBase64;
      mint = body.mintAddress ?? mintAddress ?? "";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setPhase("error");
      toast.error(msg);
      return;
    }

    // ── Step 2 + 3: sign & send ───────────────────────────────────────────────
    // phase is already "signing" from step 1 — keep it while waiting for wallet approval
    let txSignature: string;
    try {
      const txBuffer = Buffer.from(transactionBase64, "base64");
      const tx = Transaction.from(txBuffer);

      // DO NOT change recentBlockhash here — the server already set it during
      // createPool and pre-signed with platformWallet + mintKeypair.
      // Changing the blockhash would invalidate the server's partial signatures.
      // If this fails with "blockhash not found" / expired, Retry will call
      // prepare-tx again with a fresh blockhash (server cache is max 20s).

      if (wallet.signAndSendTransaction) {
        // Phantom native: signs + sends atomically via Phantom's own RPC.
        // Keep phase = "signing" until signAndSendTransaction resolves (user has approved).
        const res = await wallet.signAndSendTransaction(tx, { maxRetries: 3, preflightCommitment: "confirmed" });
        setPhase("sending");
        txSignature = res.signature;
      } else {
        // Fallback: sign first, then broadcast via public RPCs
        const signedTx = await wallet.signTransaction(tx);
        setPhase("sending"); // wallet approved — now broadcasting
        const { Connection } = await import("@solana/web3.js");
        const RPCS = [
          "https://solana-rpc.publicnode.com",
          "https://api.mainnet-beta.solana.com",
          "https://rpc.ankr.com/solana",
        ];
        let sig = "";
        for (const rpc of RPCS) {
          try {
            const conn = new Connection(rpc, "confirmed");
            sig = await conn.sendRawTransaction(signedTx.serialize(), { maxRetries: 3 });
            break;
          } catch { /* try next RPC */ }
        }
        if (!sig) throw new Error("All RPCs failed");
        txSignature = sig;
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Transaction failed";

      // Distinguish user cancellation from real errors
      const isRejection = /rejected|cancel/i.test(raw);
      // Detect expired blockhash (Phantom preflight error shows as "User rejected" or "blockhash")
      const isExpired   = /blockhash|not found|expired/i.test(raw);

      const msg = isRejection && !isExpired
        ? "Transaction cancelled."
        : isExpired
          ? "Transaction expired — click Retry to get a fresh one."
          : raw;

      setError(msg);
      setPhase("error");
      if (!isRejection || isExpired) toast.error(msg);
      return;
    }

    // ── Step 4: confirm with backend ──────────────────────────────────────────
    setPhase("confirming");
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/confirm`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ txSignature, walletAddress }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "Confirm failed");
      }
    } catch (e) {
      // Non-fatal: tx is on-chain, backend sync failed. The page will auto-refresh
      // once the indexer picks up the transaction (pool_address indexed on-chain).
      console.error("Confirm error (non-fatal):", e);
      toast.warning(
        `Transaction sent! Visit the token page to track confirmation. Sig: ${txSignature.slice(0, 8)}…`,
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

  const busy = phase === "signing" || phase === "sending" || phase === "confirming";
  const label = {
    ready:      isScheduled ? "Sign & Schedule Launch" : "Sign & Launch 🚀",
    signing:    "Waiting for signature…",
    sending:    "Sending to network…",
    confirming: "Confirming…",
  }[phase] ?? "Launch";

  return (
    <div className="space-y-4">
      {mintAddress && (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Mint address</p>
          <p className="font-mono text-xs text-foreground break-all">{mintAddress}</p>
        </div>
      )}

      {isScheduled && (
        <div className="flex items-center gap-2 rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-2.5 text-xs text-violet-700 dark:text-violet-300">
          <Clock className="size-3.5 shrink-0" />
          Token won&apos;t be tradeable until the scheduled launch date.
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={handleLaunch}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
        {label}
      </button>

      {error && (
        <p className="text-center text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
