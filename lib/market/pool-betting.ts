/**
 * Pool prediction utilities — client-only.
 * Same pattern as betting.ts: on-chain transfer → payments INSERT (pending) → admin validates.
 */

import type { WalletType } from "@/lib/wallet/adapters";

// ─── Constants (same treasury as prediction markets) ──────────────────────────
export const TREASURY_ADDRESS = "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ";
export const USDC_MINT        = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const CLT_MINT         = "DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS";

const TOKEN_PROGRAM    = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC_TOKEN_PROG = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const MEMO_PROGRAM     = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const RPC_URLS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
  "https://solana.drpc.org",
  "https://1rpc.io/sol",
];

// ─── Types ────────────────────────────────────────────────────────────────────

export type PoolBetToken = "usdc" | "clawdtrust";

export type PoolBetParams = {
  marketId:     string;
  marketTitle:  string;
  optionId:     string;
  optionLabel:  string;
  amount:       number;
  token:        PoolBetToken;
  walletAddress: string;
  walletType:   WalletType;
};

export type PoolBetResult =
  | { success: true;  reference: string; signature: string }
  | { success: false; error: string };

// ─── Helpers (duplicated from betting.ts to keep client-only) ─────────────────

type Web3 = typeof import("@solana/web3.js");
type AnyPK = any;

function serializeU64(value: number): Uint8Array {
  const buf = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) { buf[i] = v & 0xff; v = Math.floor(v / 256); }
  return buf;
}

function uiToBaseUnits(amount: number, decimals: number): number {
  return Math.round(amount * Math.pow(10, decimals));
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
      { pubkey: payer,                        isSigner: true,  isWritable: true  },
      { pubkey: ata,                          isSigner: false, isWritable: true  },
      { pubkey: owner,                        isSigner: false, isWritable: false },
      { pubkey: mint,                         isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,      isSigner: false, isWritable: false },
      { pubkey: new PublicKey(TOKEN_PROGRAM), isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function createTransferCheckedIx(
  web3: Web3,
  source: AnyPK, destination: AnyPK, mint: AnyPK, owner: AnyPK,
  amountBaseUnits: number, decimals: number
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
  return new TransactionInstruction({ programId: new PublicKey(TOKEN_PROGRAM), keys, data });
}

let _web3: Web3 | null = null;
async function loadWeb3(): Promise<Web3> {
  if (!_web3) _web3 = await import("@solana/web3.js");
  return _web3;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function submitPoolBet(params: PoolBetParams): Promise<PoolBetResult> {
  const { marketId, marketTitle, optionId, optionLabel, amount, token, walletAddress, walletType } = params;

  // 1. Get wallet provider
  const { getProviderByType } = await import("@/lib/wallet/adapters");
  const provider = getProviderByType(walletType);
  if (!provider?.signAndSendTransaction && !provider?.signTransaction) {
    return { success: false, error: "Wallet not connected or does not support transactions." };
  }

  const mint     = token === "clawdtrust" ? CLT_MINT : USDC_MINT;
  const decimals = token === "clawdtrust" ? 9 : 6;
  const reference = `POOL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;

  const memo = [
    "om?v=1",
    "kind=pool_prediction",
    `ref=${reference}`,
    `marketId=${marketId}`,
    `optionId=${optionId}`,
    `token=${token}`,
    `wallet=${walletAddress}`,
  ].join("&");

  // 2. Build Solana transaction
  const web3 = await loadWeb3();
  const { Connection, PublicKey, Transaction } = web3;

  const payerPK     = new PublicKey(walletAddress);
  const recipientPK = new PublicKey(TREASURY_ADDRESS);
  const mintPK      = new PublicKey(mint);
  const payerATA     = findATA(web3, payerPK, mintPK);
  const recipientATA = findATA(web3, recipientPK, mintPK);

  // 3. Try RPC endpoints
  const rpcErrors: string[] = [];
  let signature = "";

  for (const rpcUrl of RPC_URLS) {
    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: payerPK, recentBlockhash: blockhash });

      const recipientAtaInfo = await connection.getAccountInfo(recipientATA, "confirmed");
      if (!recipientAtaInfo) {
        tx.add(createATAIx(web3, payerPK, recipientPK, mintPK, recipientATA));
      }

      tx.add(createMemoIx(web3, payerPK, memo));
      tx.add(createTransferCheckedIx(
        web3, payerATA, recipientATA, mintPK, payerPK,
        uiToBaseUnits(amount, decimals), decimals
      ));

      if (provider.signAndSendTransaction) {
        const res = await provider.signAndSendTransaction(tx, { maxRetries: 3, preflightCommitment: "confirmed" });
        signature = res.signature;
      } else {
        const signed = await provider.signTransaction!(tx);
        signature = await connection.sendRawTransaction(
          (signed as unknown as { serialize(): Uint8Array }).serialize(),
          { maxRetries: 3 }
        );
      }

      break;
    } catch (err) {
      rpcErrors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // 4. Handle failures
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

  // 5. Persist to payments table via API route (admin client bypasses RLS)
  const apiRes = await fetch("/api/pools/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payment_request_id: `pool-req-${Date.now().toString(36)}`,
      payment_reference:  reference,
      title:              marketTitle,
      subtitle:           optionLabel,
      market_id:          marketId,
      selection_id:       optionId,
      selection_label:    optionLabel,
      amount_usdc:        amount,
      token,
      tx_signature:       signature,
      wallet_address:     walletAddress,
    }),
  });

  if (!apiRes.ok) {
    const err = await apiRes.json().catch(() => ({})) as { error?: string };
    const msg = err.error ?? `HTTP ${apiRes.status}`;
    console.error("[pool-betting] payments insert:", msg);
    return { success: false, error: `On-chain OK but registration failed: ${msg}. Contact support with TX: ${signature.slice(0,16)}` };
  }

  return { success: true, reference, signature };
}

// ─── Pool Creation ────────────────────────────────────────────────────────────

export type PoolCreationParams = {
  title:        string;
  feeToken:     "usdc" | "clawdtrust";
  walletAddress: string;
  walletType:   WalletType;
};

export type PoolCreationResult =
  | { success: true;  signature: string }
  | { success: false; error: string };

/**
 * Sends the creation fee (5 USDC or 500K CLT) to treasury.
 * Returns the tx signature on success.
 */
export async function submitPoolCreation(params: PoolCreationParams): Promise<PoolCreationResult> {
  const { feeToken, walletAddress, walletType, title } = params;

  const { getProviderByType } = await import("@/lib/wallet/adapters");
  const provider = getProviderByType(walletType);
  if (!provider?.signAndSendTransaction && !provider?.signTransaction) {
    return { success: false, error: "Wallet not connected or does not support transactions." };
  }

  const mint     = feeToken === "clawdtrust" ? CLT_MINT : USDC_MINT;
  const decimals = feeToken === "clawdtrust" ? 9 : 6;
  const feeAmount = feeToken === "clawdtrust" ? 500_000 : 5;

  const memo = [
    "om?v=1",
    "kind=pool_creation",
    `wallet=${walletAddress}`,
    `title=${encodeURIComponent(title.slice(0, 80))}`,
  ].join("&");

  const web3 = await loadWeb3();
  const { Connection, PublicKey, Transaction } = web3;

  const payerPK     = new PublicKey(walletAddress);
  const recipientPK = new PublicKey(TREASURY_ADDRESS);
  const mintPK      = new PublicKey(mint);
  const payerATA     = findATA(web3, payerPK, mintPK);
  const recipientATA = findATA(web3, recipientPK, mintPK);

  const rpcErrors: string[] = [];
  let signature = "";

  for (const rpcUrl of RPC_URLS) {
    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: payerPK, recentBlockhash: blockhash });

      const recipientAtaInfo = await connection.getAccountInfo(recipientATA, "confirmed");
      if (!recipientAtaInfo) {
        tx.add(createATAIx(web3, payerPK, recipientPK, mintPK, recipientATA));
      }

      tx.add(createMemoIx(web3, payerPK, memo));
      tx.add(createTransferCheckedIx(
        web3, payerATA, recipientATA, mintPK, payerPK,
        uiToBaseUnits(feeAmount, decimals), decimals
      ));

      if (provider.signAndSendTransaction) {
        const res = await provider.signAndSendTransaction(tx, { maxRetries: 3, preflightCommitment: "confirmed" });
        signature = res.signature;
      } else {
        const signed = await provider.signTransaction!(tx);
        signature = await connection.sendRawTransaction(
          (signed as unknown as { serialize(): Uint8Array }).serialize(),
          { maxRetries: 3 }
        );
      }

      break;
    } catch (err) {
      rpcErrors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (!signature) {
    const msg   = rpcErrors.join(" · ") || "Transaction failed";
    const lower = msg.toLowerCase();
    if (lower.includes("cancel") || lower.includes("reject") || lower.includes("denied") || lower.includes("user rejected")) {
      return { success: false, error: "Transaction cancelled." };
    }
    if (lower.includes("insufficient") || lower.includes("0x1") || lower.includes("not enough")) {
      return { success: false, error: `Insufficient ${feeToken === "clawdtrust" ? "ClawdTrust" : "USDC"} balance.` };
    }
    return { success: false, error: msg };
  }

  return { success: true, signature };
}
