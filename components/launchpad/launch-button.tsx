"use client";

/**
 * LaunchButton — two-transaction flow to minimise Phantom security warnings.
 *
 * TX A  mint creation + Metaplex metadata + platform fee (0.05 SOL)
 *       Only System / Token / Metaplex instructions → Blowfish-safe.
 *       The SOL transfer is clearly labelled in Phantom (amount + recipient).
 *
 * TX B  Meteora DBC create_virtual_pool (+ first buy if enabled)
 *       No raw SystemProgram.transfer → not flagged as a drainer.
 *       Blowfish may show "Are you sure?" but not "Request blocked".
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Transaction, PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { Loader2, Rocket, CheckCircle2, Clock } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | "ready"
  | "signing-a"   // TX A: mint + metadata + fee
  | "sending-a"
  | "signing-b"   // TX B: DBC pool creation
  | "sending-b"
  | "confirming"
  | "done"
  | "error";

type StatusResponse = {
  status: string;
  mintAddress: string | null;
  isScheduled: boolean;
};

type SolanaWallet = {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (tx: Transaction, opts?: object) => Promise<{ signature: string }>;
  connect: () => Promise<{ publicKey: PublicKey }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWallet(): SolanaWallet | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { solana?: SolanaWallet }).solana ?? null;
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
      return await new Connection(rpc, "confirmed").sendRawTransaction(
        signedTx.serialize(), { maxRetries: 3 }
      );
    } catch { /* try next */ }
  }
  throw new Error("All RPCs failed — please try again");
}

async function signAndBroadcast(
  wallet: SolanaWallet,
  txBase64: string,
  onSending: () => void,
): Promise<string> {
  const tx = Transaction.from(Buffer.from(txBase64, "base64"));
  if (wallet.signAndSendTransaction) {
    const r = await wallet.signAndSendTransaction(tx, { maxRetries: 3, preflightCommitment: "confirmed" });
    onSending();
    return r.signature;
  }
  const signed = await wallet.signTransaction(tx);
  onSending();
  return broadcastTx(signed);
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = { tokenId: string; walletAddress: string; isScheduled: boolean };

export function LaunchButton({ tokenId, walletAddress, isScheduled }: Props) {
  const router = useRouter();
  const [phase, setPhase]             = useState<Phase>("ready");
  const [mintAddress, setMintAddress] = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [hasTxA, setHasTxA]          = useState(true); // false when mint already on-chain

  useEffect(() => {
    fetch(`/api/launchpad/${tokenId}/status`)
      .then(r => r.json())
      .then((b: StatusResponse) => {
        if (b.mintAddress) setMintAddress(b.mintAddress);
        if (b.status === "active" || b.status === "graduated") setPhase("done");
      })
      .catch(() => {});
  }, [tokenId]);

  const handleLaunch = useCallback(async () => {
    setError(null);

    const wallet = getWallet();
    if (!wallet) { toast.error("Phantom not found — install it at phantom.app"); return; }

    try { await wallet.connect(); } catch {
      toast.error("Please connect your wallet first"); return;
    }

    if (wallet.publicKey?.toBase58() !== walletAddress) {
      toast.error(`Wrong wallet. Connect the creator wallet ending in …${walletAddress.slice(-6)}`);
      return;
    }

    // ── Fetch transactions from server ────────────────────────────────────────
    setPhase("signing-a");
    let txABase64: string | null, txBBase64: string;
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/prepare-tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const body = await res.json() as {
        txABase64?: string | null; txBBase64?: string;
        mintAddress?: string; error?: string;
      };
      if (!res.ok || !body.txBBase64) {
        throw new Error(body.error ?? "Failed to prepare transactions");
      }
      txABase64 = body.txABase64 ?? null;
      txBBase64 = body.txBBase64;
      setHasTxA(txABase64 !== null);
      if (body.mintAddress) setMintAddress(body.mintAddress);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg); setPhase("error"); toast.error(msg); return;
    }

    // ── TX A: mint + metadata + fee (skipped if mint already exists on-chain) ─
    if (txABase64) {
      try {
        await signAndBroadcast(wallet, txABase64, () => setPhase("sending-a"));
      } catch (e) {
        const raw = e instanceof Error ? e.message : "TX A failed";
        const isRejection = /rejected|cancel/i.test(raw);
        setError(isRejection ? "Cancelled." : raw);
        setPhase("error");
        if (!isRejection) toast.error(raw);
        return;
      }
    } else {
      // Mint already created in a previous attempt — jump straight to TX B
      toast.info("Mint already created — signing pool creation only.");
    }

    // ── TX B: DBC pool creation ───────────────────────────────────────────────
    setPhase("signing-b");
    let poolSig = "";
    try {
      poolSig = await signAndBroadcast(wallet, txBBase64, () => setPhase("sending-b"));
    } catch (e) {
      const raw = e instanceof Error ? e.message : "TX B failed";
      const isExpired = /blockhash|expired/i.test(raw);

      if (isExpired) {
        setError("Transaction expired — click Retry.");
        setPhase("error");
        toast.error("Transaction expired — click Retry.");
        return;
      }

      // Phantom sometimes fires an error AFTER broadcasting (e.g. after "Proceed anyway").
      // Poll the status endpoint to check if the pool actually landed on-chain.
      setPhase("confirming");
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const s = await fetch(`/api/launchpad/${tokenId}/status`).then(r => r.json()) as { status: string };
          if (s.status === "active" || s.status === "graduated") {
            setPhase("done");
            toast.success(isScheduled ? "Scheduled! Token will be tradeable at launch date." : "Token launched successfully!");
            setTimeout(() => router.push(`/launchpad/${tokenId}`), 1500);
            return;
          }
        } catch { /* non-fatal */ }
      }

      // Still pending after polling — genuine cancellation or failure
      setError("Pool creation cancelled. Click Retry — your fee won't be charged again. In Phantom, scroll down and tap \"Proceed anyway\" to confirm.");
      setPhase("error");
      return;
    }

    // ── Confirm ───────────────────────────────────────────────────────────────
    setPhase("confirming");
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txSignature: poolSig, walletAddress }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (res.status === 422) {
        setError("Transaction failed on-chain. Click Retry."); setPhase("error"); return;
      }
      if (res.status === 202) {
        setError("Transaction pending — wait a few seconds then click Retry."); setPhase("error"); return;
      }
      if (!res.ok || !body.ok) {
        toast.warning(`Tx sent! ${poolSig.slice(0, 8)}… — page will update shortly.`, { duration: 8000 });
      }
    } catch {
      toast.warning(`Tx sent! ${poolSig.slice(0, 8)}… — page will update shortly.`, { duration: 8000 });
    }

    setPhase("done");
    toast.success(isScheduled ? "Scheduled! Token will be tradeable at launch date." : "Token launched successfully!");
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
          onClick={() => { setError(null); setPhase("ready"); }}
          className="w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const busy = phase !== "ready";
  const labels: Record<Phase, string> = {
    ready:      isScheduled ? "Sign & Schedule Launch" : "Sign & Launch 🚀",
    "signing-a": "Step 1/2 — Approve mint + fee…",
    "sending-a": "Creating mint…",
    "signing-b": "Step 2/2 — Approve pool creation…",
    "sending-b": "Creating pool…",
    confirming: "Confirming…",
    done:       "Done",
    error:      "Error",
  };

  return (
    <div className="space-y-4">
      {isScheduled && (
        <div className="flex items-center gap-2 rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-2.5 text-xs text-violet-700 dark:text-violet-300">
          <Clock className="size-3.5 shrink-0" />
          Token won&apos;t be tradeable until the scheduled launch date.
        </div>
      )}

      {/* Context hint per step */}
      {(phase === "signing-a" || phase === "sending-a") && hasTxA && (
        <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-2.5 text-xs text-blue-700 dark:text-blue-300">
          <p className="font-semibold">Signature 1/2 — Mint creation + platform fee</p>
          <p className="mt-0.5 opacity-80">Phantom will show the {isScheduled ? "0.15" : "0.05"} SOL fee clearly. Approve to continue.</p>
        </div>
      )}
      {(phase === "signing-b" || phase === "sending-b") && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
          <p className="font-semibold">Signature 2/2 — Pool creation on Meteora</p>
          <p className="mt-0.5 opacity-80">Phantom may show a security notice. Scroll down and tap <strong>&quot;Proceed anyway&quot;</strong> — this transaction is safe.</p>
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={handleLaunch}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
        {labels[phase]}
      </button>

      {phase === "ready" && (
        <p className="text-center text-xs text-muted-foreground">
          2 signatures: mint creation + pool deployment.
        </p>
      )}
    </div>
  );
}
