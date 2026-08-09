/**
 * Meteora Dynamic Bonding Curve — transaction builder for OMdotfun launchpad.
 *
 * Install the SDK first:
 *   npm install @meteora-ag/dynamic-bonding-curve-sdk
 *
 * Required env vars:
 *   SOLANA_RPC_URL          — server-side RPC (never NEXT_PUBLIC_*)
 *   PLATFORM_WALLET_SECRET  — base58-encoded platform wallet private key
 *                             (used to sign the config creation part)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";

// ── Types matching the DBC SDK (avoids hard dependency at import time) ────────

export type DbcPoolParams = {
  /** Token name */
  name: string;
  /** Token symbol / ticker */
  symbol: string;
  /** Metaplex-compatible metadata URI (R2 JSON) */
  metadataUri: string;
  /** Creator wallet public key (signs the pool creation) */
  creatorWallet: string;
  /** Vanity mint keypair (ends in OCTO) */
  mintKeypair: Keypair;
  /** Total token supply (e.g. 1_000_000_000) */
  totalSupply: number;
  /** Creator trading fee % (1 or 2) */
  creatorFeePct: 1 | 2;
  /** First buy amount in SOL (0 = disabled) */
  firstBuySol: number;
  /** If scheduled, Unix timestamp (seconds) when pool becomes active */
  activationTimestamp?: number;
};

// ── RPC connection ─────────────────────────────────────────────────────────────

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

// ── DBC SDK integration ────────────────────────────────────────────────────────

/**
 * Build the DBC pool creation transaction.
 *
 * Returns a base64-encoded serialized transaction that the CLIENT must sign
 * with their wallet, then submit to the network.
 *
 * The platform wallet co-signs (as fee payer / config creator).
 * The mint keypair is pre-signed server-side.
 */
export async function buildCreatePoolTransaction(
  params: DbcPoolParams,
): Promise<{
  /** Base64 transaction for the client to partial-sign */
  transactionBase64: string;
  /** The mint address that was generated */
  mintAddress: string;
}> {
  // Dynamic import so the server only loads the SDK when needed
  // and build doesn't fail if the package isn't installed yet.
  let DynamicBondingCurveClient: typeof import("@meteora-ag/dynamic-bonding-curve-sdk").DynamicBondingCurveClient;
  let BN: typeof import("bn.js");
  try {
    const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    DynamicBondingCurveClient = sdk.DynamicBondingCurveClient;
    const bnMod = await import("bn.js");
    BN = bnMod.default ?? (bnMod as unknown as { default: typeof import("bn.js") }).default;
  } catch {
    throw new Error(
      "DBC SDK not installed. Run: npm install @meteora-ag/dynamic-bonding-curve-sdk bn.js"
    );
  }

  const connection   = getConnection();
  const platformWallet = getPlatformWallet();
  const creator = new PublicKey(params.creatorWallet);

  // Pool creation fee: 0.05 SOL (50_000_000 lamports) + 0.1 SOL if scheduled
  const poolCreationFeeLamports = 50_000_000;

  // Build curve config using SDK helper
  // creatorTradingFeePercentage: % of fees going to creator (rest to platform)
  const client = new DynamicBondingCurveClient(connection, "confirmed");

  // Create config transaction (signed by platform wallet).
  // The DBC SDK returns { tx, config } — config is the on-chain config PDA.
  // NOTE: verify the exact return shape once the SDK is installed; field names
  // may differ (e.g. configKey / configAccount) depending on SDK version.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configResult = await client.createConfig({
    payer: platformWallet.publicKey,
    leftoverReceiver: platformWallet.publicKey,
    feeClaimer: platformWallet.publicKey,
    quoteMint: new PublicKey("So11111111111111111111111111111111111111112"), // wSOL
    instructionParams: {
      poolFees: {
        baseFee: {
          // 1% or 2% total trading fee expressed as numerator/10^9
          cliffFeeNumerator: new BN(params.creatorFeePct * 10_000_000), // 1% = 10M / 1B
          baseFeeMode: 0, // FeeSchedulerLinear
          firstFactor: 0,
          secondFactor: new BN(0),
          thirdFactor: new BN(0),
        },
        dynamicFee: null,
      },
      activationType: params.activationTimestamp ? 1 : 0, // 1=Timestamp, 0=Slot
      collectFeeMode: 0, // QuoteToken
      migrationOption: 0, // DAMM V1
      tokenType: 0, // SPLToken
      tokenDecimal: 6,
      migrationQuoteThreshold: new BN(85 * LAMPORTS_PER_SOL), // 85 SOL graduation
      partnerLpPercentage: 0,
      creatorLpPercentage: 100,
      partnerLockedLpPercentage: 0,
      creatorLockedLpPercentage: 0,
      migrationFee: {
        feePercentage: 0,
        creatorFeePercentage: params.creatorFeePct === 2 ? 50 : 25, // split
      },
      sqrtStartPrice: new BN("79226673515401279992447579055"), // very low start price
      lockedVesting: {
        amountPerPeriod: new BN(0),
        cliffDurationFromMigrationTime: new BN(0),
        frequency: new BN(0),
        numberOfPeriod: new BN(0),
        cliffUnlockAmount: new BN(0),
      },
      creatorTradingFeePercentage: params.creatorFeePct === 2 ? 50 : 25,
      tokenSupply: null, // SDK computes from curve
      poolCreationFee: new BN(poolCreationFeeLamports),
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  // Extract the transaction and config PDA from the SDK result.
  // The SDK returns { tx: Transaction, config: PublicKey } (verify on install).
  const configTx: Transaction = configResult.tx ?? configResult;
  const configKey: PublicKey  = configResult.config ?? configResult.configKey;
  if (!configKey) {
    throw new Error(
      "createConfig did not return a config key. Check SDK version — " +
      "expected { tx, config } shape from DynamicBondingCurveClient.createConfig()"
    );
  }

  // Sign config tx with platform wallet
  configTx.partialSign(platformWallet);

  // Pool creation + optional first buy
  const firstBuyLamports = Math.floor(params.firstBuySol * LAMPORTS_PER_SOL);

  const poolTx = await client.createPoolWithFirstBuy({
    payer:    creator,
    config:   configKey,   // ← the on-chain config PDA from createConfig
    baseMint: params.mintKeypair.publicKey,
    instructionParams: {
      name:   params.name,
      symbol: params.symbol,
      uri:    params.metadataUri,
      poolCreator: creator,
    },
    firstBuyParam: firstBuyLamports > 0
      ? {
          buyer:               creator,
          buyAmount:           new BN(firstBuyLamports),
          minimumAmountOut:    new BN(0),
          referralTokenAccount: null,
        }
      : undefined,
  });

  // Pre-sign with the mint keypair (server holds this after vanity generation)
  poolTx.partialSign(params.mintKeypair);

  // Serialize as partially-signed for client to finish
  const serialized = poolTx.serialize({ requireAllSignatures: false });
  const transactionBase64 = Buffer.from(serialized).toString("base64");

  return {
    transactionBase64,
    mintAddress: params.mintKeypair.publicKey.toBase58(),
  };
}

/**
 * Build a minimal metadata JSON compatible with Metaplex Token Metadata.
 * Upload this to R2 or IPFS and pass the URI to buildCreatePoolTransaction.
 */
export function buildMetadataJson(params: {
  name: string;
  symbol: string;
  description: string;
  logoUrl: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}): Record<string, unknown> {
  return {
    name: params.name,
    symbol: params.symbol,
    description: params.description,
    image: params.logoUrl,
    external_url: params.website ?? "",
    attributes: [],
    properties: {
      files: [{ uri: params.logoUrl, type: "image/png" }],
      category: "image",
    },
    extensions: {
      website: params.website ?? null,
      twitter: params.twitter ?? null,
      telegram: params.telegram ?? null,
    },
  };
}
