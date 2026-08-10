/**
 * Meteora Dynamic Bonding Curve — transaction builder for OMdotfun launchpad.
 *
 * Required env vars:
 *   SOLANA_RPC_URL          — server-side RPC (never NEXT_PUBLIC_*)
 *   PLATFORM_WALLET_SECRET  — base58-encoded platform wallet private key
 */

import {
  Connection,
  Keypair,
  PublicKey,
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
  /** Creator trading fee % (fixed at 1) */
  creatorFeePct: 1;
  /** First buy amount in SOL (0 = disabled) */
  firstBuySol: number;
  /** Unix timestamp (seconds) for scheduled pools; undefined = immediate */
  activationTimestamp?: number;
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

// ── wSOL mint ─────────────────────────────────────────────────────────────────

const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build the DBC pool creation transaction.
 *
 * Flow:
 *  1. Server generates a config keypair and calls partner.createConfigAndPoolWithFirstBuy()
 *  2. Server signs + submits createConfigTx (config keypair + platform wallet)
 *  3. Server pre-signs createPoolWithFirstBuyTx (mint keypair + platform wallet)
 *  4. Returns base64 transaction for the client (creator) to finish signing
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
      "DBC SDK not installed. Run: npm install @meteora-ag/dynamic-bonding-curve-sdk bn.js"
    );
  }

  const connection    = getConnection();
  const platformWallet = getPlatformWallet();
  const creator       = new PublicKey(params.creatorWallet);

  // New keypair for the on-chain config account (must sign createConfigTx)
  const configKeypair = Keypair.generate();

  const client = new DynamicBondingCurveClient(connection, "confirmed");

  const poolCreationFeeLamports = 50_000_000; // 0.05 SOL
  const firstBuyLamports = Math.floor(params.firstBuySol * LAMPORTS_PER_SOL);

  const { createConfigTx, createPoolWithFirstBuyTx } =
    await client.partner.createConfigAndPoolWithFirstBuy({
      // ── Accounts ──────────────────────────────────────────────────────────
      config:           configKeypair.publicKey,
      feeClaimer:       platformWallet.publicKey,
      leftoverReceiver: platformWallet.publicKey,
      payer:            platformWallet.publicKey,
      quoteMint:        WSOL,

      // ── ConfigParameters (on-chain IDL type) ──────────────────────────────
      poolFees: {
        baseFee: {
          // 1% total trading fee = 10_000_000 / 1_000_000_000
          cliffFeeNumerator: new BN(params.creatorFeePct * 10_000_000),
          baseFeeMode:  0,       // FeeSchedulerLinear
          firstFactor:  0,
          secondFactor: new BN(0),
          thirdFactor:  new BN(0),
        },
        dynamicFee: null,
      },
      activationType:  params.activationTimestamp ? 1 : 0,  // 1=Timestamp, 0=Slot
      activationPoint: params.activationTimestamp
        ? new BN(params.activationTimestamp)
        : null,
      collectFeeMode:  0,  // QuoteToken
      migrationOption: 0,  // DAMM V1
      tokenType:       0,  // SPLToken
      tokenDecimal:    6,
      migrationQuoteThreshold: new BN(85 * LAMPORTS_PER_SOL),
      partnerLpPercentage:       0,
      creatorLpPercentage:       100,
      partnerLockedLpPercentage: 0,
      creatorLockedLpPercentage: 0,
      migrationFee: {
        feePercentage:        0,
        creatorFeePercentage: 25,
      },
      // Very low start price (essentially 0)
      sqrtStartPrice: new BN("79226673515401279992447579055"),
      lockedVesting: {
        amountPerPeriod:                 new BN(0),
        cliffDurationFromMigrationTime:  new BN(0),
        frequency:                       new BN(0),
        numberOfPeriod:                  new BN(0),
        cliffUnlockAmount:               new BN(0),
      },
      creatorTradingFeePercentage: 25,
      tokenSupply:     null,
      poolCreationFee: new BN(poolCreationFeeLamports),

      // ── Pool params ───────────────────────────────────────────────────────
      preCreatePoolParam: {
        name:        params.name,
        symbol:      params.symbol,
        uri:         params.metadataUri,
        poolCreator: creator,
        baseMint:    params.mintKeypair.publicKey,
      },

      // ── Optional first buy ────────────────────────────────────────────────
      firstBuyParam: firstBuyLamports > 0
        ? {
            buyer:                creator,
            buyAmount:            new BN(firstBuyLamports),
            minimumAmountOut:     new BN(0),
            referralTokenAccount: null,
          }
        : undefined,
    });

  // ── Step 1: sign + submit the config creation transaction ─────────────────
  // createConfigTx must be signed by the config keypair (new account) + platform wallet (payer)
  createConfigTx.feePayer = platformWallet.publicKey;
  createConfigTx.partialSign(configKeypair, platformWallet);
  const configSig = await connection.sendRawTransaction(createConfigTx.serialize());
  await connection.confirmTransaction(configSig, "confirmed");

  // ── Step 2: refresh blockhash + pre-sign the pool transaction ────────────
  // The pool tx was built at the same time as configTx and shares its blockhash.
  // After waiting for configTx confirmation, that blockhash may have expired.
  // We refresh it here to give the client a fresh ~60s window to sign.
  const { blockhash: freshBlockhash } = await connection.getLatestBlockhash("confirmed");
  createPoolWithFirstBuyTx.recentBlockhash = freshBlockhash;
  createPoolWithFirstBuyTx.feePayer = platformWallet.publicKey;
  createPoolWithFirstBuyTx.partialSign(platformWallet, params.mintKeypair);

  const serialized = createPoolWithFirstBuyTx.serialize({ requireAllSignatures: false });
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
    },
    extensions: {
      website:  params.website  ?? null,
      twitter:  params.twitter  ?? null,
      telegram: params.telegram ?? null,
    },
  };
}
