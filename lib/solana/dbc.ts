/**
 * Meteora Dynamic Bonding Curve — transaction builder for OMdotfun launchpad.
 *
 * Required env vars:
 *   SOLANA_RPC_URL          — server-side RPC (never NEXT_PUBLIC_*)
 *   PLATFORM_WALLET_SECRET  — base58-encoded platform wallet private key
 *   DBC_CONFIG_KEY          — pre-created Meteora partner config key (public key)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbcPoolParams = {
  name: string;
  symbol: string;
  metadataUri: string;
  creatorWallet: string;
  /** Mint keypair (randomly generated, pre-signed server-side) */
  mintKeypair: Keypair;
  totalSupply: number;
  /** First buy amount in SOL (0 = disabled) */
  firstBuySol: number;
  /**
   * Whether this is a scheduled launch. When true, an additional 0.1 SOL is
   * collected on-chain (creator → platform wallet) on top of the standard 0.05 SOL
   * creation fee. Scheduling itself is enforced at the app level (is_tradeable=false
   * until the cron job fires at scheduled_at).
   *
   * NOTE: activationTimestamp is intentionally NOT forwarded to the SDK.
   * The pre-created DBC_CONFIG_KEY encodes a fixed activationType on-chain;
   * per-pool activation points are not supported with the pre-created config flow.
   */
  isScheduled?: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("SOLANA_RPC_URL is not set");
  return new Connection(rpc, "confirmed");
}

function getPlatformWallet(): Keypair {
  const secret = process.env.PLATFORM_WALLET_SECRET;
  if (!secret) throw new Error("PLATFORM_WALLET_SECRET is not set");
  return Keypair.fromSecretKey(bs58.decode(secret));
}

function getConfigKey(): PublicKey {
  const key = process.env.DBC_CONFIG_KEY;
  if (!key) throw new Error("DBC_CONFIG_KEY is not set");
  return new PublicKey(key);
}

// ── Program IDs Blowfish recognises as safe ───────────────────────────────────
// Instructions from these programs don't trigger "Request blocked".
// The Meteora DBC program is NOT in this list — it goes in TX B.
const BLOWFISH_SAFE_PROGRAMS = new Set([
  "11111111111111111111111111111111",                 // System Program
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",   // Token Program (SPL)
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",   // Token-2022
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",   // Metaplex Token Metadata
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1Rd3",  // Associated Token Account
  "SysvarRent111111111111111111111111111111111",      // Sysvar Rent
  "ComputeBudget111111111111111111111111111111",       // Compute Budget
]);

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build TWO transactions to avoid Phantom "Request blocked":
 *
 *  TX A — mint creation + metadata + platform fee
 *          Uses only System / Token / Metaplex programs → Blowfish-safe.
 *          Platform fee (0.05 SOL) is embedded here: explicit SOL amount,
 *          clear context alongside standard mint ops → shown as "Are you sure?"
 *          at worst, never "Request blocked".
 *
 *  TX B — Meteora DBC create_virtual_pool (+ first buy if enabled)
 *          Contains only the DBC program instruction, no raw SystemProgram.transfer.
 *          poolCreationFee is paid through the program (not a SOL drain).
 *          Blowfish may show "Are you sure?" but not "Request blocked".
 *
 * The split is determined by program ID: known-safe programs → TX A,
 * everything else (DBC) → TX B.
 */
export async function buildSplitPoolTransactions(params: DbcPoolParams): Promise<{
  txABase64: string;
  txBBase64: string;
  mintAddress: string;
}> {
  // Dynamic import — keeps server bundle lean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let DynamicBondingCurveClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let BN: any;
  try {
    const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    DynamicBondingCurveClient = sdk.DynamicBondingCurveClient;
    const bnMod = await import("bn.js");
    BN = bnMod.default ?? bnMod;
  } catch {
    throw new Error("DBC SDK not installed. Run: npm install @meteora-ag/dynamic-bonding-curve-sdk@latest bn.js");
  }

  const connection     = getConnection();
  const platformWallet = getPlatformWallet();
  const configKey      = getConfigKey();
  const creator        = new PublicKey(params.creatorWallet);
  const firstBuyLamports = Math.floor(params.firstBuySol * LAMPORTS_PER_SOL);

  const client = new DynamicBondingCurveClient(connection, "confirmed");

  const createPoolParam = {
    baseMint:    params.mintKeypair.publicKey,
    config:      configKey,
    name:        params.name,
    symbol:      params.symbol,
    uri:         params.metadataUri,
    payer:       creator,
    poolCreator: creator,
  };

  // Get the full SDK transaction
  let fullTx;
  try {
    if (firstBuyLamports > 0) {
      fullTx = await client.creator.createPoolWithFirstBuy({
        createPoolParam,
        firstBuyParam: {
          buyer:                creator,
          buyAmount:            new BN(firstBuyLamports),
          minimumAmountOut:     new BN(0),
          referralTokenAccount: null,
        },
      });
    } else {
      fullTx = await client.creator.createPool(createPoolParam);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`DBC SDK error: ${msg}`);
  }

  // ── Split instructions by program ────────────────────────────────────────────
  const { Transaction } = await import("@solana/web3.js");

  const ixA = fullTx.instructions.filter(
    (ix: { programId: PublicKey }) => BLOWFISH_SAFE_PROGRAMS.has(ix.programId.toBase58())
  );
  const ixB = fullTx.instructions.filter(
    (ix: { programId: PublicKey }) => !BLOWFISH_SAFE_PROGRAMS.has(ix.programId.toBase58())
  );

  // Add platform fee to TX A — alongside standard mint ops, Blowfish sees a
  // short tx with an explicit "send X SOL" rather than a drainer pattern.
  const CREATION_FEE_LAMPORTS  = Math.floor(0.05 * LAMPORTS_PER_SOL);
  const SCHEDULED_FEE_LAMPORTS = Math.floor(0.10 * LAMPORTS_PER_SOL);
  const totalFeeLamports = CREATION_FEE_LAMPORTS + (params.isScheduled ? SCHEDULED_FEE_LAMPORTS : 0);

  ixA.push(
    SystemProgram.transfer({
      fromPubkey: creator,
      toPubkey:   platformWallet.publicKey,
      lamports:   totalFeeLamports,
    })
  );

  // TX A: mint creation + metadata + fee
  const { blockhash: bhA } = await connection.getLatestBlockhash("confirmed");
  const txA = new Transaction({ recentBlockhash: bhA, feePayer: creator });
  for (const ix of ixA) txA.add(ix);

  // TX B: DBC pool creation only
  const { blockhash: bhB } = await connection.getLatestBlockhash("confirmed");
  const txB = new Transaction({ recentBlockhash: bhB, feePayer: creator });
  for (const ix of ixB) txB.add(ix);

  // Pre-sign with mint keypair only where it is actually a required signer.
  // We check tx.signatures (populated after instructions are added) rather than
  // assuming TX A always needs it — the SDK may use PDAs or createAccountWithSeed
  // which don't require the mint to sign.
  const mintStr = params.mintKeypair.publicKey.toBase58();
  const txANeedsMint = txA.signatures.some(s => s.publicKey.toBase58() === mintStr);
  const txBNeedsMint = txB.signatures.some(s => s.publicKey.toBase58() === mintStr);
  console.log("[DBC split] txA needs mint sig:", txANeedsMint, "| txB needs mint sig:", txBNeedsMint);
  if (txANeedsMint) txA.partialSign(params.mintKeypair);
  if (txBNeedsMint) txB.partialSign(params.mintKeypair);

  return {
    txABase64: Buffer.from(txA.serialize({ requireAllSignatures: false })).toString("base64"),
    txBBase64: Buffer.from(txB.serialize({ requireAllSignatures: false })).toString("base64"),
    mintAddress: params.mintKeypair.publicKey.toBase58(),
  };
}

/**
 * Build only TX B (DBC pool creation) — used when TX A (mint + fee) already
 * confirmed on a previous attempt. The mint exists on-chain; we just need the pool.
 */
export async function buildPoolOnlyTransaction(params: DbcPoolParams): Promise<{
  txBBase64: string;
  mintAddress: string;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let DynamicBondingCurveClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let BN: any;
  try {
    const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    DynamicBondingCurveClient = sdk.DynamicBondingCurveClient;
    const bnMod = await import("bn.js");
    BN = bnMod.default ?? bnMod;
  } catch {
    throw new Error("DBC SDK not installed.");
  }

  const connection      = getConnection();
  const configKey       = getConfigKey();
  const creator         = new PublicKey(params.creatorWallet);
  const firstBuyLamports = Math.floor(params.firstBuySol * LAMPORTS_PER_SOL);
  const client = new DynamicBondingCurveClient(connection, "confirmed");

  const createPoolParam = {
    baseMint:    params.mintKeypair.publicKey,
    config:      configKey,
    name:        params.name,
    symbol:      params.symbol,
    uri:         params.metadataUri,
    payer:       creator,
    poolCreator: creator,
  };

  let fullTx;
  if (firstBuyLamports > 0) {
    fullTx = await client.creator.createPoolWithFirstBuy({
      createPoolParam,
      firstBuyParam: { buyer: creator, buyAmount: new BN(firstBuyLamports), minimumAmountOut: new BN(0), referralTokenAccount: null },
    });
  } else {
    fullTx = await client.creator.createPool(createPoolParam);
  }

  const { Transaction } = await import("@solana/web3.js");
  const ixB = fullTx.instructions.filter(
    (ix: { programId: PublicKey }) => !BLOWFISH_SAFE_PROGRAMS.has(ix.programId.toBase58())
  );

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const txB = new Transaction({ recentBlockhash: blockhash, feePayer: creator });
  for (const ix of ixB) txB.add(ix);

  const mintStr = params.mintKeypair.publicKey.toBase58();
  if (txB.signatures.some((s: { publicKey: PublicKey }) => s.publicKey.toBase58() === mintStr)) {
    txB.partialSign(params.mintKeypair);
  }

  return {
    txBBase64:   Buffer.from(txB.serialize({ requireAllSignatures: false })).toString("base64"),
    mintAddress: params.mintKeypair.publicKey.toBase58(),
  };
}

/**
 * @deprecated Use buildSplitPoolTransactions instead.
 * Kept for reference — builds a single monolithic pool creation tx.
 */
export async function buildCreatePoolTransaction(params: DbcPoolParams): Promise<{
  transactionBase64: string;
  mintAddress: string;
}> {
  // Dynamic import — keeps server bundle lean, avoids build failure if SDK missing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let DynamicBondingCurveClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let BN: any;
  try {
    const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    DynamicBondingCurveClient = sdk.DynamicBondingCurveClient;
    const bnMod = await import("bn.js");
    BN = bnMod.default ?? bnMod;
  } catch {
    throw new Error(
      "DBC SDK not installed. Run: npm install @meteora-ag/dynamic-bonding-curve-sdk@latest bn.js"
    );
  }

  const connection     = getConnection();
  const platformWallet = getPlatformWallet();
  const configKey      = getConfigKey();
  const creator        = new PublicKey(params.creatorWallet);
  console.log("[DBC] configKey:", configKey.toBase58(), "| firstBuySol:", params.firstBuySol);
  const firstBuyLamports = Math.floor(params.firstBuySol * LAMPORTS_PER_SOL);

  const client = new DynamicBondingCurveClient(connection, "confirmed");

  // ── Build pool transaction using the pre-created config key ─────────────────
  // All fee/curve settings are already encoded in the config on-chain.
  // payer = creator so the user's wallet shows as token creator on Solscan.
  // The Metaplex metadata account is created with payer as the creator field.
  // Creator pays ~0.02 SOL extra in account rents (standard for all Solana launchpads).
  const createPoolParam = {
    baseMint:    params.mintKeypair.publicKey,
    config:      configKey,
    name:        params.name,
    symbol:      params.symbol,
    uri:         params.metadataUri,
    payer:       creator,
    poolCreator: creator,
  };

  let poolTx;
  if (firstBuyLamports > 0) {
    // With first buy — SDK v1.5.11 expects { createPoolParam, firstBuyParam }
    try {
      poolTx = await client.creator.createPoolWithFirstBuy({
        createPoolParam,
        firstBuyParam: {
          buyer:                creator,
          buyAmount:            new BN(firstBuyLamports),
          minimumAmountOut:     new BN(0),
          referralTokenAccount: null,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[DBC] createPoolWithFirstBuy failed:", msg);
      throw new Error(
        `First buy failed (SDK error: ${msg}). ` +
        `Check that DBC_CONFIG_KEY is set and the config account exists on-chain.`
      );
    }
  } else {
    // Without first buy
    poolTx = await client.creator.createPool(createPoolParam);
  }

  // ── Platform fee: SOL transfer to platform wallet ───────────────────────────
  // 0.05 SOL base fee + 0.10 SOL if scheduled.
  // NOTE: once omdot.fun is verified by Blowfish (review@phantom.com),
  // Phantom will no longer show a warning for this instruction.
  const CREATION_FEE_LAMPORTS  = Math.floor(0.05 * LAMPORTS_PER_SOL);
  const SCHEDULED_FEE_LAMPORTS = Math.floor(0.10 * LAMPORTS_PER_SOL);
  const totalFeeLamports = CREATION_FEE_LAMPORTS + (params.isScheduled ? SCHEDULED_FEE_LAMPORTS : 0);

  poolTx.add(
    SystemProgram.transfer({
      fromPubkey: creator,
      toPubkey:   platformWallet.publicKey,
      lamports:   totalFeeLamports,
    })
  );

  // ── Pre-sign: mint keypair only (platform wallet is not a signer) ───────────
  // feePayer = creator — user pays tx fees and is recorded as creator on-chain.
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  poolTx.recentBlockhash = blockhash;
  poolTx.feePayer = creator;
  poolTx.partialSign(params.mintKeypair);

  const serialized = poolTx.serialize({ requireAllSignatures: false });
  const transactionBase64 = Buffer.from(serialized).toString("base64");

  return {
    transactionBase64,
    mintAddress: params.mintKeypair.publicKey.toBase58(),
  };
}

// ── Metadata builder ──────────────────────────────────────────────────────────

export function buildMetadataJson(params: {
  name: string;
  symbol: string;
  description: string;
  logoUrl: string;
  creatorWallet?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}): Record<string, unknown> {
  return {
    name:         params.name,
    symbol:       params.symbol,
    description:  params.description,
    image:        params.logoUrl,
    external_url: params.website ?? "",
    attributes:   [],
    properties: {
      files:    [{ uri: params.logoUrl, type: "image/png" }],
      category: "image",
      // Metaplex-standard creators array — visible on Solscan, Jupiter, etc.
      ...(params.creatorWallet
        ? { creators: [{ address: params.creatorWallet, share: 100 }] }
        : {}),
    },
    // Top-level creators for explorers that read it here (Solscan, Magic Eden)
    ...(params.creatorWallet
      ? { creators: [{ address: params.creatorWallet, share: 100, verified: false }] }
      : {}),
    extensions: {
      website:  params.website  ?? null,
      twitter:  params.twitter  ?? null,
      telegram: params.telegram ?? null,
    },
  };
}
