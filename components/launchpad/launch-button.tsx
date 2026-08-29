"use client";

/**
 * LaunchButton — two-transaction flow.
 *
 * TX A  mint + metadata + platform fee   → no Phantom warning
 * TX B  Meteora DBC create_virtual_pool  → "Proceed anyway" in Phantom
 *
 * When TX B throws (Phantom fires error even after "Proceed anyway"), we
 * immediately call /check-pool to detect if the pool was actually created
 * on-chain before showing any error to the user.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Transaction, PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { Loader2, Rocket, CheckCircle2, Clock } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | "ready"
  | "signing-a"
  | "sending-a"
  | "signing-b"
  | "sending-b"
  | "confirming"
  | "done"
  | "error";

type StatusResponse = { status: string; mintAddress: string | null; isScheduled: boolean };

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
  for (const rpc of [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
    "https://rpc.ankr.com/solana",
  ]) {
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

/** Wait for a transaction to reach "confirmed" status before proceeding. */
async function waitForConfirmation(sig: string): Promise<void> {
  const { Connection } = await import("@solana/web3.js");
  const RPCS = [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
    "https://rpc.ankr.com/solana",
  ];
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    for (const rpc of RPCS) {
      try {
        const status = await new Connection(rpc, "confirmed").getSignatureStatus(sig);
        const cs = status.value?.confirmationStatus;
        if (cs === "confirmed" || cs === "finalized") return;
        if (status.value?.err) throw new Error("TX A failed on-chain");
      } catch (e) {
        if (e instanceof Error && e.message.includes("failed on-chain")) throw e;
        /* try next RPC */
      }
    }
  }
  // 30s timeout — proceed anyway, TX B may still work
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = { tokenId: string; walletAddress: string; isScheduled: boolean };

export function LaunchButton({ tokenId, walletAddress, isScheduled }: Props) {
  const router = useRouter();
  const [phase, setPhase]     = useState<Phase>("ready");
  const [mintAddress, setMintAddress] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [hasTxA, setHasTxA]  = useState(true);

  useEffect(() => {
    fetch(`/api/launchpad/${tokenId}/status`)
      .then(r => r.json())
      .then((b: StatusResponse) => {
        if (b.mintAddress) setMintAddress(b.mintAddress);
        if (b.status === "active" || b.status === "graduated") setPhase("done");
      })
      .catch(() => {});
  }, [tokenId]);

  /**
   * After a TX B error, check if the pool was actually created on-chain.
   * Phantom often fires an error callback even after "Proceed anyway" succeeds.
   * Returns true if we detected success and navigated away.
   */
  const checkPoolAndFinish = useCallback(async (): Promise<boolean> => {
    // Immediate check-pool (derives PDA from mint, getAccountInfo)
    try {
      const r = await fetch(`/api/launchpad/${tokenId}/check-pool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const b = await r.json() as { found?: boolean };
      if (b.found) {
        setPhase("done");
        toast.success(isScheduled ? "Scheduled!" : "Token launched successfully!");
        setTimeout(() => router.push(`/launchpad/${tokenId}`), 1500);
        return true;
      }
    } catch { /* non-fatal */ }

    // Poll up to 30s — Meteora tx may take a few seconds to finalize
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const s = await fetch(`/api/launchpad/${tokenId}/status`).then(r => r.json()) as { status: string };
        if (s.status === "active" || s.status === "graduated") {
          setPhase("done");
          toast.success(isScheduled ? "Scheduled!" : "Token launched successfully!");
          setTimeout(() => router.push(`/launchpad/${tokenId}`), 1500);
          return true;
        }
      } catch { /* non-fatal */ }

      // Re-check PDA every 3 polls
      if (i % 3 === 2) {
        try {
          const r2 = await fetch(`/api/launchpad/${tokenId}/check-pool`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletAddress }),
          });
          const b2 = await r2.json() as { found?: boolean };
          if (b2.found) {
            setPhase("done");
            toast.success(isScheduled ? "Scheduled!" : "Token launched successfully!");
            setTimeout(() => router.push(`/launchpad/${tokenId}`), 1500);
            return true;
          }
        } catch { /* non-fatal */ }
      }
    }
    return false;
  }, [tokenId, walletAddress, isScheduled, router]);

  const handleLaunch = useCallback(async () => {
    setError(null);

    const wallet = getWallet();
    if (!wallet) { toast.error("Phantom not found — install it at phantom.app"); return; }
    try { await wallet.connect(); } catch { toast.error("Please connect your wallet first"); return; }
    if (wallet.publicKey?.toBase58() !== walletAddress) {
      toast.error(`Wrong wallet. Connect the creator wallet ending in …${walletAddress.slice(-6)}`);
      return;
    }

    // ── Fetch transactions ────────────────────────────────────────────────────
    setPhase("signing-a");
    let txABase64: string | null, txBBase64: string;
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/prepare-tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const body = await res.json() as {
        txABase64?: string | null; txBBase64?: string; mintAddress?: string; error?: string;
      };
      if (!res.ok || !body.txBBase64) throw new Error(body.error ?? "Failed to prepare transactions");
      txABase64 = body.txABase64 ?? null;
      txBBase64 = body.txBBase64;
      setHasTxA(txABase64 !== null);
      if (body.mintAddress) setMintAddress(body.mintAddress);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg); setPhase("error"); toast.error(msg); return;
    }

    // ── TX A: mint + metadata + fee (skipped if mint already on-chain) ────────
    if (txABase64) {
      let txASig = "";
      try {
        txASig = await signAndBroadcast(wallet, txABase64, () => setPhase("sending-a"));
      } catch (e) {
        const raw = e instanceof Error ? e.message : "TX A failed";
        setError(/rejected|cancel/i.test(raw) ? "Cancelled." : raw);
        setPhase("error");
        return;
      }
      // Wait for TX A to confirm before TX B — Meteora needs the mint to exist on-chain
      try {
        await waitForConfirmation(txASig);
      } catch {
        setError("Mint creation failed on-chain. Click Retry.");
        setPhase("error");
        return;
      }
    } else {
      toast.info("Mint already created — approving pool creation only.");
    }

    // ── TX B: DBC pool creation ───────────────────────────────────────────────
    setPhase("signing-b");
    let poolSig = "";
    try {
      poolSig = await signAndBroadcast(wallet, txBBase64, () => setPhase("sending-b"));
    } catch (e) {
      const raw = e instanceof Error ? e.message : "TX B failed";
      // Pool may have been created despite the error — check on-chain first
      setPhase("confirming");
      const found = await checkPoolAndFinish();
      if (!found) {
        setError("Pool creation cancelled. Click Retry — your fee won't be charged again.\nIn Phantom, scroll down and tap \"Proceed anyway\" to confirm.");
        setPhase("error");
      }
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
      if (res.status === 422) { setError("Transaction failed on-chain. Click Retry."); setPhase("error"); return; }
      if (res.status === 202) { setError("Transaction pending — wait a few seconds then click Retry."); setPhase("error"); return; }
      if (!res.ok || !body.ok) toast.warning(`Tx sent! ${poolSig.slice(0, 8)}… — page will update shortly.`, { duration: 8000 });
    } catch {
      toast.warning(`Tx sent! ${poolSig.slice(0, 8)}… — page will update shortly.`, { duration: 8000 });
    }

    setPhase("done");
    toast.success(isScheduled ? "Scheduled! Token will be tradeable at launch date." : "Token launched successfully!");
    setTimeout(() => router.push(`/launchpad/${tokenId}`), 1500);
  }, [tokenId, walletAddress, mintAddress, isScheduled, router, checkPoolAndFinish]);

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
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400 whitespace-pre-line">
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
    ready:       isScheduled ? "Sign & Schedule Launch" : "Sign & Launch 🚀",
    "signing-a": "Step 1/2 — Approve in Phantom…",
    "sending-a": "Creating mint…",
    "signing-b": "Step 2/2 — Approve pool in Phantom…",
    "sending-b": "Creating pool…",
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

      {(phase === "signing-b" || phase === "sending-b") && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
          <p className="font-semibold">Pool creation — Meteora</p>
          <p className="mt-0.5 opacity-80">
            Phantom may show a security notice. Scroll down and tap{" "}
            <strong>&quot;Proceed anyway&quot;</strong> to confirm.
          </p>
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
          2 signatures : mint + pool.
        </p>
      )}
    </div>
  );
}
