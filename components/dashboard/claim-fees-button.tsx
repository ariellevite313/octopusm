"use client";

import { useState, useEffect } from "react";
import { Transaction, PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { Loader2, CoinsIcon } from "lucide-react";

type SolanaWallet = {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (tx: Transaction, opts?: object) => Promise<{ signature: string }>;
  connect: () => Promise<{ publicKey: PublicKey }>;
};

function getWallet(): SolanaWallet | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { solana?: SolanaWallet }).solana ?? null;
}

type Props = {
  tokenId: string;
  walletAddress: string;
  poolAddress: string;
};

export function ClaimFeesButton({ tokenId, walletAddress, poolAddress: _poolAddress }: Props) {
  const [phase, setPhase]           = useState<"idle" | "building" | "signing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg]     = useState("");
  const [claimable, setClaimable]     = useState<number | null>(null);
  const [feesUsd24h, setFeesUsd24h]   = useState<number | null>(null);
  const [loadingAmt, setLoadingAmt]   = useState(true);

  // Fetch claimable amount on mount
  useEffect(() => {
    fetch(`/api/launchpad/${tokenId}/claim-fees`)
      .then(r => r.json())
      .then((body: { claimableSol?: number | null; feesUsd24h?: number | null }) => {
        setClaimable(body.claimableSol ?? null);
        setFeesUsd24h(body.feesUsd24h ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingAmt(false));
  }, [tokenId]);

  async function handleClaim() {
    setPhase("building");
    setErrorMsg("");

    const wallet = getWallet();
    if (!wallet) {
      toast.error("Phantom wallet not found");
      setPhase("idle");
      return;
    }

    try {
      await wallet.connect();
    } catch {
      toast.error("Connect your wallet first");
      setPhase("idle");
      return;
    }

    if (wallet.publicKey?.toBase58() !== walletAddress) {
      toast.error(`Wrong wallet — use the creator wallet …${walletAddress.slice(-6)}`);
      setPhase("idle");
      return;
    }

    // Step 1: build claim tx server-side
    let txBase64: string;
    let claimableSol: number | null = null;
    try {
      const res = await fetch(`/api/launchpad/${tokenId}/claim-fees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const body = await res.json() as { transactionBase64?: string; claimableSol?: number; error?: string };
      if (!res.ok || !body.transactionBase64) {
        throw new Error(body.error ?? "Failed to build transaction");
      }
      txBase64 = body.transactionBase64;
      claimableSol = body.claimableSol ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      setErrorMsg(msg);
      setPhase("error");
      toast.error(msg);
      return;
    }

    // Step 2: sign + send
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
      toast.success(label + ` — Sig: ${sig.slice(0, 8)}…`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Transaction failed";
      const msg = /rejected|cancel/i.test(raw) ? "Transaction cancelled." : raw;
      setErrorMsg(msg);
      setPhase("error");
      if (!/rejected|cancel/i.test(raw)) toast.error(msg);
    }
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
        <button
          type="button"
          onClick={() => setPhase("idle")}
          className="text-xs text-muted-foreground underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const busy  = phase === "building" || phase === "signing";
  const label = phase === "building" ? "Preparing…" : phase === "signing" ? "Signing…" : "Claim fees";

  return (
    <div className="space-y-2">
      {/* Claimable amount */}
      <div className="flex items-center gap-1.5">
        <CoinsIcon className="size-3.5 text-muted-foreground shrink-0" />
        {loadingAmt ? (
          <span className="text-xs text-muted-foreground">Loading…</span>
        ) : claimable !== null ? (
          <span className="text-sm font-semibold text-foreground">
            {claimable.toFixed(6)} SOL
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
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/70 disabled:opacity-50 transition-colors"
      >
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        {label}
      </button>
    </div>
  );
}
