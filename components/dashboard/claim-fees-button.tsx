"use client";

import { useState } from "react";
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
  const [phase, setPhase] = useState<"idle" | "building" | "signing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleClaim() {
    setPhase("building");
    setErrorMsg("");

    const wallet = getWallet();
    if (!wallet) {
      toast.error("Phantom wallet non trouvé");
      setPhase("idle");
      return;
    }

    try {
      await wallet.connect();
    } catch {
      toast.error("Connecte ton wallet d'abord");
      setPhase("idle");
      return;
    }

    if (wallet.publicKey?.toBase58() !== walletAddress) {
      toast.error(`Mauvais wallet — utilise le wallet créateur …${walletAddress.slice(-6)}`);
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
      const label = claimableSol !== null ? `${claimableSol.toFixed(6)} SOL réclamé !` : "Frais réclamés !";
      toast.success(label + ` — Sig: ${sig.slice(0, 8)}…`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Transaction failed";
      const msg = /rejected|cancel/i.test(raw) ? "Transaction annulée." : raw;
      setErrorMsg(msg);
      setPhase("error");
      if (!/rejected|cancel/i.test(raw)) toast.error(msg);
    }
  }

  if (phase === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        ✓ Frais réclamés
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
          Réessayer
        </button>
      </div>
    );
  }

  const busy = phase === "building" || phase === "signing";
  const label = phase === "building" ? "Préparation…" : phase === "signing" ? "Signature…" : "Claim fees";

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleClaim}
      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/70 disabled:opacity-50 transition-colors"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CoinsIcon className="size-3.5" />}
      {label}
    </button>
  );
}
