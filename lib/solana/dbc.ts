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

function getConfigKey(): PublicKey {
  const key = process.env.DBC_CONFIG_KEY;
  if (!key) throw new Error("DBC_CONFIG_KEY is not set");
  return new PublicKey(key);
}

// ── wSOL mint ─────────────────────────────────────────────────────────────────

const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build the DBC pool creation transaction using the pre-created partner config key.
 *
 * Flow (simplified — no createConfigTx needed):
 *  1. Server calls creator.createPoolWithFirstBuy() with the existing config key
 *  2. Server pre-signs the tx (mint keypair + platform wallet)
 *  3. Returns base64 transaction for the client (creator) to finish signing
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

  const connection     = getConnection();
  const platformWallet = getPlatformWallet();
  const configKey      = getConfigKey();
  const creator        = new PublicKey(params.creatorWallet);

  const client = new DynamicBondingCurveClient(connection, "confirmed");

  const firstBuyLamports = Math.floor(params.firstBuySol * LAMPORTS_PER_SOL);

  // Use the pre-created partner config key — no createConfigTx needed
  const createPoolTx = await client.creator.createPoolWithFirstBuy({
    config:  configKey,
    payer:   platformWallet.publicKey,

    // ── Pool params ─────────────────────────────────────────────────────────
    preCreatePoolParam: {
      name:        params.name,
      symbol:      params.symbol,
      uri:         params.metadataUri,
      poolCreator: creator,
      baseMint:    params.mintKeypair.publicKey,
    },

    // ── Optional first buy ──────────────────────────────────────────────────
    firstBuyParam: firstBuyLamports > 0
      ? {
          buyer:                creator,
          buyAmount:            new BN(firstBuyLamports),
          minimumAmountOut:     new BN(0),
          referralTokenAccount: null,
        }
      : undefined,
  });

  // ── Pre-sign the pool transaction ─────────────────────────────────────────
  // Platform wallet pays fees; mint keypair signs as the new token account.
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  createPoolTx.recentBlockhash = blockhash;
  createPoolTx.feePayer = platformWallet.publicKey;
  createPoolTx.partialSign(platformWallet, params.mintKeypair);

  const serialized = createPoolTx.serialize({ requireAllSignatures: false });
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
