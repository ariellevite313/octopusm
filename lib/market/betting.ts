/**
 * Betting utilities — client-only (uses window, Solana wallet).
 * No server imports — safe to import from "use client" components.
 */

import type { WalletType, SolanaProvider } from "@/lib/wallet/adapters";

// ─── Constants ────────────────────────────────────────────────────────────────

export const TREASURY_ADDRESS = "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const CLT_MINT = "DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS";

export const FEE_RATE = 5;           // % taken from winnings
export const RESERVE_FEE_RATE = 1;   // % added on top of stake
export const MIN_STAKE_USDC = 2;
export const MAX_STAKE_USDC = 50;
export const MIN_STAKE_CLT = 500_000;

// All Solana RPC calls go through our server-side proxy to avoid CORS blocks,
// 403s, and rate limits that affect direct browser-to-RPC connections.
// The proxy tries SOLANA_RPC_URL (Helius/QuickNode) then public fallbacks.
// We use an absolute URL because @solana/web3.js Connection requires one.
function getRpcUrls(): string[] {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return [`${origin}/api/solana/rpc`];
}

// Solana program IDs (hardcoded to avoid @solana/spl-token dependency)
const TOKEN_PROGRAM    = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC_TOKEN_PROG = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const MEMO_PROGRAM     = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BetToken = "usdc" | "clawdtrust";

export type BetParams = {
  marketId: string;
  marketTitle: string;
  categoryId: string;
  optionId: string;
  optionLabel: string;
  optionMultiplier: number;
  amount: number;        // stake before reserve fee
  token: BetToken;
  walletAddress: string;
  walletType: WalletType;
};

export type BetResult =
  | { success: true;  reference: string; signature: string }
  | { success: false; error: string };

export type RewardBreakdown = {
  stake: number;
  reserveFee: number;
  totalCharged: number;
  grossReward: number;
  netReward: number;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function buildBetReference(): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BET-${ts}-${rand}`;
}

export function computeReward(amount: number, multiplier: number): RewardBreakdown {
  const reserveFee   = Number((amount * (RESERVE_FEE_RATE / 100)).toFixed(2));
  const totalCharged = Number((amount + reserveFee).toFixed(2));
  const grossReward  = Number((amount * multiplier).toFixed(2));
  const netReward    = Number((grossReward * (1 - FEE_RATE / 100)).toFixed(2));
  return { stake: amount, reserveFee, totalCharged, grossReward, netReward };
}

// ─── Solana instruction builders ─────────────────────────────────────────────

type Web3 = typeof import("@solana/web3.js");

type AnyPK = any;

// BUG-15 fix: use BigInt to avoid 32-bit integer overflow on large token amounts.
function serializeU64(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) { buf[i] = Number(v & 0xffn); v >>= 8n; }
  return buf;
}

// BUG-14 fix: return bigint to avoid IEEE 754 precision loss on large amounts.
function uiToBaseUnits(amount: number, decimals: number): bigint {
  const factor = BigInt(Math.pow(10, decimals));
  return BigInt(Math.round(amount)) * factor;
}

function findATA(web3: Web3, owner: AnyPK, mint: AnyPK): AnyPK {
  const { PublicKey } = web3;
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), new PublicKey(TOKEN_PROGRAM).toBuffer(), mint.toBuffer()],
    new PublicKey(ASSOC_TOKEN_PROG)
  )[0];
}

function createMemoIx(web3: Web3, payer: AnyPK, memo: string) {
  const { PublicKey, TransactionInstruction } = web3;
  return new TransactionInstruction({
    programId: new PublicKey(MEMO_PROGRAM),
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    data: Buffer.from(memo, "utf8"),
  });
}

function createATAIx(web3: Web3, payer: AnyPK, owner: AnyPK, mint: AnyPK, ata: AnyPK) {
  const { PublicKey, SystemProgram, TransactionInstruction } = web3;
  return new TransactionInstruction({
    programId: new PublicKey(ASSOC_TOKEN_PROG),
    keys: [
      { pubkey: payer,                   isSigner: true,  isWritable: true  },
      { pubkey: ata,                     isSigner: false, isWritable: true  },
      { pubkey: owner,                   isSigner: false, isWritable: false },
      { pubkey: mint,                    isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(TOKEN_PROGRAM), isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function createTransferCheckedIx(
  web3: Web3,
  source: AnyPK, destination: AnyPK, mint: AnyPK, owner: AnyPK,
  amountBaseUnits: bigint, decimals: number, reference?: AnyPK
) {
  const { PublicKey, TransactionInstruction } = web3;
  const data = Buffer.alloc(10);
  data[0] = 12;
  Buffer.from(serializeU64(amountBaseUnits)).copy(data, 1);
  data[9] = decimals;
  const keys: any[] = [
    { pubkey: source,      isSigner: false, isWritable: true  },
    { pubkey: mint,        isSigner: false, isWritable: false },
    { pubkey: destination, isSigner: false, isWritable: true  },
    { pubkey: owner,       isSigner: true,  isWritable: false },
  ];
  if (reference) keys.push({ pubkey: reference, isSigner: false, isWritable: false });
  return new TransactionInstruction({ programId: new PublicKey(TOKEN_PROGRAM), keys, data });
}

// ─── Lazy web3.js loader ──────────────────────────────────────────────────────

let _web3: Web3 | null = null;
async function loadWeb3(): Promise<Web3> {
  if (!_web3) _web3 = await import("@solana/web3.js");
  return _web3;
}

// ─── Main: submit a bet ───────────────────────────────────────────────────────

export async function submitBet(params: BetParams): Promise<BetResult> {
  const {
    marketId, marketTitle, categoryId,
    optionId, optionLabel, optionMultiplier,
    amount, token, walletAddress, walletType,
  } = params;

  // 1. Grab wallet provider
  const adapters = await import("@/lib/wallet/adapters");
  let provider = adapters.getProviderByType(walletType);

  // Fallback: if walletType lookup fails, try window.solana (injected by most wallets)
  if (!provider && typeof window !== "undefined") {
    const w = window as unknown as { solana?: SolanaProvider };
    const s = w.solana;
    if (s && (s.signAndSendTransaction || s.signTransaction)) {
      provider = s;
    }
  }

  if (!provider?.signAndSendTransaction && !provider?.signTransaction) {
    return {
      success: false,
      error: "Wallet not found. Please disconnect and reconnect your wallet, then try again.",
    };
  }

  const { reserveFee, totalCharged } = computeReward(amount, optionMultiplier);
  const reference = buildBetReference();          // DB reference (human-readable)
  const mint      = token === "clawdtrust" ? CLT_MINT : USDC_MINT;
  const decimals  = token === "clawdtrust" ? 9 : 6;

  // 2. Build Solana transaction
  const web3 = await loadWeb3();
  const { Connection, PublicKey, Transaction, Keypair } = web3;

  const payerPK     = new PublicKey(walletAddress);
  const recipientPK = new PublicKey(TREASURY_ADDRESS);
  const mintPK      = new PublicKey(mint);
  // Random keypair public key used as on-chain reference for findReference()
  const refPK       = Keypair.generate().publicKey;

  const memo = [
    "om?v=1",
    `kind=prediction`,
    `ref=${reference}`,
    `marketId=${marketId}`,
    `selectionId=${optionId}`,
    `token=${token}`,
    `wallet=${walletAddress}`,
  ].join("&");

  const payerATA     = findATA(web3, payerPK, mintPK);
  const recipientATA = findATA(web3, recipientPK, mintPK);

  // 3. Try each RPC until one succeeds
  const rpcErrors: string[] = [];
  let signature = "";

  for (const rpcUrl of getRpcUrls()) {
    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: payerPK, recentBlockhash: blockhash });

      // Create recipient ATA if it doesn't exist
      const recipientAtaInfo = await connection.getAccountInfo(recipientATA, "confirmed");
      if (!recipientAtaInfo) {
        tx.add(createATAIx(web3, payerPK, recipientPK, mintPK, recipientATA));
      }

      tx.add(createMemoIx(web3, payerPK, memo));
      tx.add(
        createTransferCheckedIx(
          web3,
          payerATA, recipientATA, mintPK, payerPK,
          uiToBaseUnits(totalCharged, decimals), decimals, refPK
        )
      );

      // Sign + broadcast. No server-side verification — admin approves all bets.
      if (provider.signTransaction) {
        const signed = await provider.signTransaction(tx);
        signature = await connection.sendRawTransaction(
          (signed as unknown as { serialize(): Uint8Array }).serialize(),
          { maxRetries: 5, preflightCommitment: "confirmed" }
        );
      } else if (provider.signAndSendTransaction) {
        const res = await provider.signAndSendTransaction(tx, {
          maxRetries: 3,
          preflightCommitment: "confirmed",
        });
        signature = res.signature;
      } else {
        throw new Error("Wallet does not support signing transactions.");
      }

      break; // success — exit RPC loop
    } catch (err) {
      rpcErrors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // 4. Handle failure before DB write
  if (!signature) {
    const msg   = rpcErrors.join(" · ") || "Transaction failed";
    const lower = msg.toLowerCase();
    if (lower.includes("cancel") || lower.includes("reject") || lower.includes("denied") || lower.includes("user rejected")) {
      return { success: false, error: "Transaction cancelled." };
    }
    if (lower.includes("insufficient") || lower.includes("0x1") || lower.includes("not enough")) {
      return { success: false, error: `Insufficient ${token === "clawdtrust" ? "ClawdTrust" : "USDC"} balance.` };
    }
    return { success: false, error: msg };
  }

  // 5. Persist via server route (bypasses RLS — admin reviews -> creates prediction_history)
  try {
    const res = await fetch("/api/markets/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_request_id: `req-${Date.now().toString(36)}`,
        payment_reference:  reference,
        title:              marketTitle,
        subtitle:           optionLabel,
        category_label:     categoryId,
        market_id:          marketId,
        selection_id:       optionId,
        selection_label:    optionLabel,
        // Store the actual stake regardless of token — "amount_usdc" is legacy naming.
        // The token field tells the admin route which currency was used.
        amount_usdc:        amount,
        reserve_fee_usdc:   reserveFee,
        total_paid_usdc:    totalCharged,
        token,
        tx_signature:       signature,
        wallet_address:     walletAddress,
      }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      console.error("[betting] predict API:", body.error);
    }
  } catch (e) {
    console.error("[betting] predict API fetch:", e);
  }

  // Note: OCTO is awarded at admin approval time (admin/bets route, 5 OCTO per bet).
  // No immediate fire-and-forget needed here.

  return { success: true, reference, signature };
}
