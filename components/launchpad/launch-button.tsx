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

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Transaction, PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { Loader2, Rocket, CheckCircle2, Clock, ShieldAlert } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | "ready"
  | "pick-wallet"    // Wallet selector shown before TX A
  | "signing-a"
  | "sending-a"
  | "warn-phantom"   // Modal shown before TX B
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

// ── Multi-wallet support ───────────────────────────────────────────────────────

type WalletConfig = {
  id: string;
  name: string;
  icon: string;        // emoji fallback
  iconUrl?: string;    // logo URL
  recommended?: boolean;
  get: () => SolanaWallet | null;
  installUrl: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = () => (typeof window !== "undefined" ? (window as any) : null);

const WALLET_CONFIGS: WalletConfig[] = [
  {
    id: "solflare",
    name: "Solflare",
    icon: "🌟",
    iconUrl: "https://solflare.com/favicon.ico",
    recommended: true,
    get: () => w()?.solflare?.isSolflare ? w()?.solflare : null,
    installUrl: "https://solflare.com",
  },
  {
    id: "phantom",
    name: "Phantom",
    icon: "👻",
    iconUrl: "https://phantom.app/favicon.ico",
    get: () => w()?.phantom?.solana ?? (w()?.solana?.isPhantom ? w()?.solana : null),
    installUrl: "https://phantom.app",
  },
  {
    id: "backpack",
    name: "Backpack",
    icon: "🎒",
    iconUrl: "https://backpack.app/favicon.ico",
    get: () => w()?.backpack?.solana ?? w()?.xnft?.solana ?? null,
    installUrl: "https://backpack.app",
  },
  {
    id: "okx",
    name: "OKX Wallet",
    icon: "⭕",
    iconUrl: "https://www.okx.com/favicon.ico",
    get: () => w()?.okxwallet?.solana ?? null,
    installUrl: "https://www.okx.com/web3",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    icon: "🔵",
    iconUrl: "https://www.coinbase.com/favicon.ico",
    get: () => w()?.coinbaseSolana ?? null,
    installUrl: "https://www.coinbase.com/wallet",
  },
  {
    id: "trust",
    name: "Trust Wallet",
    icon: "🛡️",
    iconUrl: "https://trustwallet.com/favicon.ico",
    get: () => w()?.trustwallet?.solana ?? (w()?.solana?.isTrust ? w()?.solana : null),
    installUrl: "https://trustwallet.com",
  },
];

function getInstalledWallets(): WalletConfig[] {
  if (typeof window === "undefined") return [];
  return WALLET_CONFIGS.filter(c => c.get() !== null);
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

  // Stores the TX B base64 while the warn-phantom modal is shown
  const pendingTxBRef = useRef<string | null>(null);
  // The wallet chosen by the user in the picker
  const selectedWalletRef   = useRef<SolanaWallet | null>(null);
  // ID of the selected wallet config (e.g. "phantom", "solflare")
  const selectedWalletIdRef = useRef<string | null>(null);

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

  // ── Core launch flow (runs after wallet is selected) ─────────────────────────
  const runLaunchFlow = useCallback(async (wallet: SolanaWallet) => {
    setError(null);

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

    pendingTxBRef.current = txBBase64;

    // Only Phantom shows the Blowfish "Are you sure?" warning for unverified programs.
    // For all other wallets, skip the modal and go straight to signing.
    if (selectedWalletIdRef.current === "phantom") {
      setPhase("warn-phantom");
      return; // proceedToTxB() called by button click
    }

    // ── Non-Phantom: sign TX B immediately ───────────────────────────────────
    setPhase("signing-b");
    let poolSig = "";
    try {
      poolSig = await signAndBroadcast(wallet, txBBase64, () => setPhase("sending-b"));
    } catch {
      setPhase("confirming");
      const found = await checkPoolAndFinish();
      if (!found) {
        setError("Pool creation cancelled. Click Retry — your fee won't be charged again.");
        setPhase("error");
      }
      return;
    }

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
  }, [tokenId, walletAddress, isScheduled, router, checkPoolAndFinish]);

  // ── TX B: pool creation (called from warn-phantom modal button) ──────────────
  const proceedToTxB = useCallback(async () => {
    const txBBase64 = pendingTxBRef.current;
    if (!txBBase64) { setError("Session expired. Click Retry."); setPhase("error"); return; }

    const wallet = selectedWalletRef.current;
    if (!wallet) { setError("Wallet disconnected. Click Retry."); setPhase("error"); return; }

    setPhase("signing-b");
    let poolSig = "";
    try {
      poolSig = await signAndBroadcast(wallet, txBBase64, () => setPhase("sending-b"));
    } catch {
      setPhase("confirming");
      const found = await checkPoolAndFinish();
      if (!found) {
        setError(
          "Pool creation cancelled. Click Retry — your fee won't be charged again.\n" +
          "In your wallet: scroll down and confirm the transaction."
        );
        setPhase("error");
      }
      return;
    }

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
  }, [tokenId, walletAddress, isScheduled, router, checkPoolAndFinish]);

  // ── Called when user picks a wallet from the picker ──────────────────────────
  const handleWalletSelected = useCallback(async (cfg: WalletConfig) => {
    const wallet = cfg.get();
    if (!wallet) { toast.error(`${cfg.name} not found — please install it first`); return; }
    try { await wallet.connect(); } catch { toast.error("Please unlock your wallet and try again"); return; }
    if (wallet.publicKey?.toBase58() !== walletAddress) {
      toast.error(`Wrong wallet. Connect the creator wallet ending in …${walletAddress.slice(-6)}`);
      return;
    }
    selectedWalletRef.current   = wallet;
    selectedWalletIdRef.current = cfg.id;
    await runLaunchFlow(wallet);
  }, [walletAddress, runLaunchFlow]);

  const handleLaunch = useCallback(async () => {
    setError(null);
    const installed = getInstalledWallets();
    if (installed.length === 0) {
      toast.error("No Solana wallet found. Install Phantom, Solflare, or Backpack.");
      return;
    }
    if (installed.length === 1) {
      // Only one wallet — skip picker, go straight to flow
      await handleWalletSelected(installed[0]);
      return;
    }
    // Multiple wallets — show picker
    setPhase("pick-wallet");
  }, [handleWalletSelected]);

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

  if (phase === "pick-wallet") {
    const installed = getInstalledWallets();
    const allWallets = WALLET_CONFIGS;
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Choose your wallet</p>
        <div className="space-y-2">
          {allWallets.map(cfg => {
            const isInstalled = installed.some(wc => wc.id === cfg.id);
            return (
              <button
                key={cfg.id}
                type="button"
                disabled={!isInstalled}
                onClick={() => handleWalletSelected(cfg)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="text-lg leading-none">{cfg.icon}</span>
                <span className="flex-1 text-left flex items-center gap-2">
                  {cfg.name}
                  {cfg.recommended && (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
                      Recommended
                    </span>
                  )}
                </span>
                {isInstalled ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-normal">Detected</span>
                ) : (
                  <a
                    href={cfg.installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-normal"
                  >
                    Install
                  </a>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setPhase("ready")}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (phase === "warn-phantom") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Your wallet will show a security warning
            </p>
          </div>
          <p className="text-xs text-amber-700/90 dark:text-amber-300/90 leading-relaxed">
            The second transaction creates your trading pool via <strong>Meteora DBC</strong>.
            This program is not yet verified by all wallets, which may trigger a warning — this is normal and safe.
          </p>
          <div className="rounded-lg bg-amber-500/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 font-medium">
            👉 In your wallet: scroll down → confirm the transaction
          </div>
          <p className="text-xs text-amber-700/70 dark:text-amber-300/70">
            Funds go directly to the Meteora protocol to create your liquidity — not to omdot.fun.
          </p>
        </div>
        <button
          type="button"
          onClick={proceedToTxB}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Rocket className="size-4" />
          Got it — create the pool
        </button>
        <button
          type="button"
          onClick={() => { pendingTxBRef.current = null; setPhase("ready"); }}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
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
    ready:           isScheduled ? "Sign & Schedule Launch" : "Sign & Launch 🚀",
    "pick-wallet":   "Choose wallet…",
    "signing-a":     "Step 1/2 — Approve in wallet…",
    "sending-a":     "Creating mint…",
    "warn-phantom":  "Security notice",
    "signing-b":     "Step 2/2 — Approve pool in wallet…",
    "sending-b":     "Creating pool…",
    confirming:      "Confirming…",
    done:            "Done",
    error:           "Error",
  };

  return (
    <div className="space-y-4">
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
