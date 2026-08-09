"use client";

/**
 * LaunchButton — polls vanity address status, then guides the user through
 * the on-chain DBC pool creation:
 *
 *  1. Poll /api/launchpad/[id]/status until vanityReady
 *  2. Call /api/launchpad/[id]/prepare-tx → get base64 transaction
 *  3. Deserialize + sign with user wallet (via window.solana / Phantom)
 *  4. Send to network
 *  5. Call /api/launchpad/[id]/confirm with the tx signature
 *  6. Redirect to /launchpad/[id]
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Transaction, Connection, PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { Loader2, Rocket, CheckCircle2, Clock } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | "polling"       // waiting for vanity address
  | "ready"         // vanity ready, waiting for user to click
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
  connect: () => Promise<{ publicKey: PublicKey }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWallet(): SolanaWallet | null {
  if (typeof window === "undefined") return null;
  const w = (window as unknown as { solana?: SolanaWallet }).solana;
  return w ?? null;
}

function getRpc(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  tokenId: string;
  walletAddress: string;
  isScheduled: boolean;
};

export function LaunchButton({ tokenId, walletAddress, isScheduled }: Props) {
  const router = useRouter();
  const [phase, setPhase]           = useState<Phase>("polling");
  const [mintAddress, setMintAddress] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [dots, setDots]             = useState("");

  // ── Animated dots for polling state ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== "polling") return;
    const id = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 500);
    return () => clearInterval(id);
  }, [phase]);

  // ── Poll status until vanity address is ready ────────────────────────────────
  useEffect(() => {
    if (phase !== "polling") return;
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const res  = await fetch(`/api/launchpad/${tokenId}/status`);
          const body = await res.json() as StatusResponse;

          if (body.vanityReady && body.mintAddress) {
            setMintAddress(body.mintAddress);
            setPhase("ready");
            return;
          }
          if (body.status === "active" || body.status === "graduated") {
            setPhase("done");
            return;
          }
        } catch {
          // network error — keep polling
        }
        // wait 3 seconds between polls
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    void poll();
    return () => { cancelled = true; };
  }, [phase, tokenId]);

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

    // ── Step 2: deserialize + sign with wallet ────────────────────────────────
    let signedTx: Transaction;
    try {
      const txBuffer = Buffer.from(transactionBase64, "base64");
      const tx = Transaction.from(txBuffer);

      // Set recent blockhash if missing
      if (!tx.recentBlockhash) {
        const connection = new Connection(getRpc(), "confirmed");
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
      }

      signedTx = await wallet.signTransaction(tx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Signature rejected";
      setError(msg);
      setPhase("ready"); // let user retry
      toast.error("Transaction rejected: " + msg);
      return;
    }

    // ── Step 3: send to network ───────────────────────────────────────────────
    setPhase("sending");
    let txSignature: string;
    try {
      const connection = new Connection(getRpc(), "confirmed");
      const serialized = signedTx.serialize();
      txSignature = await connection.sendRawTransaction(serialized, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      setError(msg);
      setPhase("error");
      toast.error("Failed to send transaction: " + msg);
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
      // Non-fatal: tx is on-chain, just backend confirmation failed
      console.error("Confirm error (non-fatal):", e);
      toast.warning("Transaction sent! Backend sync pending.");
    }

    // ── Done ──────────────────────────────────────────────────────────────────
    setPhase("done");
    toast.success(
      isScheduled
        ? "Token created! It will be tradeable at the scheduled date."
        : "Token launched successfully! 🚀"
    );
    setTimeout(() => router.push(`/launchpad/${tokenId}`), 1500);
  }, [tokenId, walletAddress, mintAddress, isScheduled, router]);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (phase === "done") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-5" />
        <span className="text-sm font-semibold">
          {isScheduled ? "Scheduled! Coming soon." : "Launched successfully!"}
        </span>
      </div>
    );
  }

  if (phase === "polling") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-5 py-4">
          <Loader2 className="size-5 animate-spin text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Generating vanity address{dots}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Finding a mint address ending in <span className="font-mono font-bold text-violet-600 dark:text-violet-400">OCTO</span>
            </p>
          </div>
        </div>
        <p className="text-xs text-center text-muted-foreground">
          This usually takes 10–60 seconds. Don&apos;t close this page.
        </p>
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
          onClick={() => { setError(null); setPhase("polling"); }}
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
          <p className="text-xs text-muted-foreground mb-1">Mint address (vanity ✓)</p>
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
