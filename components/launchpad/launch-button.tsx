"use client";

/**
 * LaunchButton — two-transaction flow to avoid Phantom "Request blocked".
 *
 * TX1 — Platform fee (simple SOL transfer → clean Phantom confirmation)
 * TX2 — Meteora pool creation (no SOL drain instruction)
 *
 * Retry protection: if TX1 succeeded but TX2 was rejected, the fee is
 * recorded server-side (record-fee-tx). On retry, prepare-fee-tx returns
 * {skip: true} so TX1 is skipped — the user only signs TX2.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Transaction, PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { Loader2, Rocket, CheckCircle2, Clock } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | "ready"
  | "fee-signing"   // TX1: waiting for user to approve fee
  | "fee-sending"   // TX1: broadcasting
  | "signing"       // TX2: waiting for user to approve pool tx
  | "sending"       // TX2: broadcasting
  | "confirming"
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
  const { Connection } = await import("@solana/web3.js");
  const RPCS = [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
    "https://rpc.ankr.com/solana",
  ];
  for (const rpc of RPCS) {
    try {
      const conn = new Connection(rpc, "confirmed");
      return await conn.sendRawTransaction(signedTx.serialize(), { maxRetries: 3 });
    } catch { /* try next */ }
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
  const [feeSkipped, setFeeSkipped]   = useState(false);

  useEffect(() => {
    fetch(`/api/launchpad/${tokenId}/status`)
      .then(r => r.json())
      .then((body: StatusResponse) => {
        if (body.mintAddress) setMintAddress(body.mintAddress);
        if (body.status === "active" || body.status === "graduated") setPhase("done");
      })
      .catch(() => {});
  }, [tokenId]);

  const handleLaunch = useCallback(async () => {
    setError(null);

    const wallet = getWallet();
    if (!wallet) {
      toast.error("Phantom wallet not found. Install it at phantom.app");
      return;
    }
    try { await wallet.connect(); } catch {
      toast.error("Please connect your wallet first");
      return;
    }

    const connectedAddress = wallet.publicKey?.toBase58();
    if (connectedAddress !== walletAddress) {
      toast.error(`Wrong wallet. Connect the creator wallet ending in …${walletAddress.slice(-6)}`);
      return;
    }

    // ── TX1: Platform fee ────────────────────────────────────────────────────
    setPhase("fee-signing");

    // Ask server for fee tx — may return {skip: true} if already paid
    let skipFee = false;
    let feeTxBase64 = "";
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/prepare-fee-tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const body = await res.json() as { skip?: boolean; transactionBase64?: string; error?: string };
      if (!res.ok && !body.skip) throw new Error(body.error ?? "Failed to prepare fee transaction");
      skipFee = body.skip === true;
      feeTxBase64 = body.transactionBase64 ?? "";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setPhase("error");
      toast.error(msg);
      return;
    }

    setFeeSkipped(skipFee);

    if (!skipFee) {
      let feeSig = "";
      try {
        const feeTx = Transaction.from(Buffer.from(feeTxBase64, "base64"));
        if (wallet.signAndSendTransaction) {
          const r = await wallet.signAndSendTransaction(feeTx, { maxRetries: 3, preflightCommitment: "confirmed" });
          feeSig = r.signature;
        } else {
          const signed = await wallet.signTransaction(feeTx);
          setPhase("fee-sending");
          feeSig = await broadcastTx(signed);
        }
      } catch (e) {
        const raw = e instanceof Error ? e.message : "Fee transaction failed";
        const isRejection = /rejected|cancel/i.test(raw);
        setError(isRejection ? "Fee payment cancelled." : raw);
        setPhase("error");
        if (!isRejection) toast.error(raw);
        return;
      }

      // Record fee payment — so retry skips TX1
      fetch(`/api/launchpad/${tokenId}/record-fee-tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, feeTxSig: feeSig }),
      }).catch(() => {/* non-fatal */});
    }

    // ── TX2: Pool creation ───────────────────────────────────────────────────
    setPhase("signing");

    let transactionBase64: string;
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/prepare-tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const body = await res.json() as { transactionBase64?: string; mintAddress?: string; error?: string };
      if (!res.ok || !body.transactionBase64) throw new Error(body.error ?? "Failed to prepare pool transaction");
      transactionBase64 = body.transactionBase64;
      if (body.mintAddress) setMintAddress(body.mintAddress);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setPhase("error");
      toast.error(msg);
      return;
    }

    let txSignature: string;
    try {
      const tx = Transaction.from(Buffer.from(transactionBase64, "base64"));
      if (wallet.signAndSendTransaction) {
        const r = await wallet.signAndSendTransaction(tx, { maxRetries: 3, preflightCommitment: "confirmed" });
        setPhase("sending");
        txSignature = r.signature;
      } else {
        const signed = await wallet.signTransaction(tx);
        setPhase("sending");
        txSignature = await broadcastTx(signed);
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Transaction failed";
      const isRejection = /rejected|cancel/i.test(raw);
      const isExpired   = /blockhash|not found|expired/i.test(raw);
      const msg = isRejection && !isExpired
        ? "Pool creation cancelled. Your fee is saved — click Retry to try again without paying the fee."
        : isExpired
          ? "Transaction expired — click Retry to get a fresh one."
          : raw;
      setError(msg);
      setPhase("error");
      if (!isRejection || isExpired) toast.error(msg);
      return;
    }

    // ── Confirm ──────────────────────────────────────────────────────────────
    setPhase("confirming");
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txSignature, walletAddress }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (res.status === 422) {
        setError("Transaction failed on-chain. Click Retry to try again.");
        setPhase("error");
        return;
      }
      if (res.status === 202) {
        setError("Transaction pending… Wait a few seconds then click Retry.");
        setPhase("error");
        toast.info("Transaction pending — retry in a few seconds");
        return;
      }
      if (!res.ok || !body.ok) {
        toast.warning(`Transaction sent! Sig: ${txSignature.slice(0, 8)}… — page will update automatically.`, { duration: 8000 });
      }
    } catch {
      toast.warning(`Transaction sent! Sig: ${txSignature.slice(0, 8)}… — page will update automatically.`, { duration: 8000 });
    }

    setPhase("done");
    toast.success(isScheduled ? "Token created! It will be tradeable at the scheduled date." : "Token launched successfully!");
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
          onClick={() => { setError(null); setFeeSkipped(false); setPhase("ready"); }}
          className="w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const busy = phase !== "ready";

  const label: Record<Phase, string> = {
    ready:        isScheduled ? "Sign & Schedule Launch" : "Sign & Launch 🚀",
    "fee-signing": "Step 1/2 — Approve fee payment…",
    "fee-sending": "Sending fee…",
    signing:      feeSkipped ? "Approve pool creation…" : "Step 2/2 — Approve pool creation…",
    sending:      "Sending to network…",
    confirming:   "Confirming…",
    done:         "Done",
    error:        "Error",
  };

  return (
    <div className="space-y-4">
      {isScheduled && (
        <div className="flex items-center gap-2 rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-2.5 text-xs text-violet-700 dark:text-violet-300">
          <Clock className="size-3.5 shrink-0" />
          Token won&apos;t be tradeable until the scheduled launch date.
        </div>
      )}

      {phase === "fee-signing" && (
        <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-2.5 text-xs text-blue-700 dark:text-blue-300">
          <span className="font-semibold">Signature 1/2:</span> Platform fee ({isScheduled ? "0.15" : "0.05"} SOL). Check Phantom.
        </div>
      )}
      {(phase === "signing" || phase === "sending") && (
        <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-2.5 text-xs text-violet-700 dark:text-violet-300">
          <span className="font-semibold">{feeSkipped ? "Pool creation:" : "Signature 2/2:"}</span> Meteora pool creation. Check Phantom.
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

      {phase === "ready" && (
        <p className="text-center text-xs text-muted-foreground">
          2 signatures required: fee payment + pool creation.
        </p>
      )}
    </div>
  );
}
