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

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build the DBC pool creation transaction using the pre-created partner config key.
 *
 * Flow (single transaction — no createConfigTx needed):
 *  1. Server calls client.creator.createPool() with the existing config key
 *  2. Server pre-signs the tx (platform wallet + mint keypair)
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
  const createPoolParam = {
    baseMint:    params.mintKeypair.publicKey,
    config:      configKey,
    name:        params.name,
    symbol:      params.symbol,
    uri:         params.metadataUri,
    payer:       platformWallet.publicKey,
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

  // ── Platform creation fee: 0.05 SOL (+ 0.1 SOL if scheduled) → platform wallet
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

  // ── Pre-sign: platform wallet (payer) + mint keypair ────────────────────────
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  poolTx.recentBlockhash = blockhash;
  poolTx.feePayer = platformWallet.publicKey;
  poolTx.partialSign(platformWallet, params.mintKeypair);

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
