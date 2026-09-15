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
  ComputeBudgetProgram,
} from "@solana/web3.js";
import bs58 from "bs58";
import { getXStockMint } from "@/lib/solana/xstocks";

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
  /**
   * xStock symbol for Stock-Paired tokens (e.g. "xNVDA").
   * When set, `buildStockPairedSplitTransactions` is used instead of the standard SOL path.
   * A fresh DBC config is created on-the-fly per pool — no env var needed.
   */
  stockSymbol?: string | null;
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

function getSolConfigKey(): PublicKey {
  const key = process.env.DBC_CONFIG_KEY ?? "";
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

// ── xStock pool builder ────────────────────────────────────────────────────────

const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";

/** Strip ComputeBudget instructions from an SDK-built Transaction (we set our own). */
function stripComputeBudget(ixs: { programId: PublicKey }[]): { programId: PublicKey }[] {
  return ixs.filter(ix => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM);
}

/**
 * Build THREE transactions for xStock-paired tokens.
 *
 * TX B (createConfig) alone can be ~600 bytes; merged with TX C (createPool) it
 * would exceed Solana's 1232-byte legacy tx limit. Three separate TXs are required.
 *
 *  TX A — platform fee (0.05 SOL) — Blowfish-safe, no Phantom warning
 *  TX B — DBC createConfig (fresh keypair, quoteMint = xStock)
 *          Pre-signed by platformWallet + configKeypair (server-side)
 *          feePayer = creator (user signs last)
 *  TX C — DBC createPool (creates meme mint + metadata + pool + vaults)
 *          Pre-signed by mintKeypair (server-side)
 *          feePayer = creator (user signs last)
 *
 * Returns configKeypairSecret (base64) so the caller can persist it for retry.
 */
export async function buildStockPairedTransactions(
  params: DbcPoolParams,
  configKeypairOverride?: Keypair,    // pass to rebuild TX B on retry
): Promise<{
  txABase64: string;
  txBBase64: string;
  txCBase64: string;
  mintAddress: string;
  configAddress: string;
  configKeypairSecret: string;        // base64 — store in DB for retry
}> {
  const xStockMintStr = getXStockMint(params.stockSymbol!);
  if (!xStockMintStr) throw new Error(`Unknown xStock symbol: ${params.stockSymbol}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sdk: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let BN: any;
  try {
    sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    const bnMod = await import("bn.js");
    BN = bnMod.default ?? bnMod;
  } catch {
    throw new Error("DBC SDK not installed. Run: npm install @meteora-ag/dynamic-bonding-curve-sdk@latest bn.js");
  }

  const {
    DynamicBondingCurveClient,
    buildCurveWithMarketCap,
    MigrationOption,
    MigrationFeeOption,
    TokenType,
    TokenDecimal,
    TokenAuthorityOption,
    ActivationType,
    CollectFeeMode,
    BaseFeeMode,
  } = sdk;

  const connection     = getConnection();
  const platformWallet = getPlatformWallet();
  const creator        = new PublicKey(params.creatorWallet);
  const quoteMint      = new PublicKey(xStockMintStr);

  // Use caller-provided keypair (retry) or generate a fresh one (first build)
  const configKeypair = configKeypairOverride ?? Keypair.generate();

  const client = new DynamicBondingCurveClient(connection, "confirmed");

  // ── Curve parameters ─────────────────────────────────────────────────────────
  // Both base (meme token) and quote (xStock) have 6 decimals.
  // migrationMarketCap: 100 xStock tokens — e.g. xNVDA@$150 → $15K graduation.
  // initialMarketCap:   0.001 xStock tokens → near-zero starting price.
  const curveParams = buildCurveWithMarketCap({
    token: {
      tokenType:            TokenType.SPLToken,
      tokenBaseDecimal:     TokenDecimal.SIX,
      tokenQuoteDecimal:    TokenDecimal.SIX,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply:     params.totalSupply,
      leftover:             Math.round(params.totalSupply * 0.1),  // 10% buffer — absorbs curve-vs-supply precision gap
    },
    fee: {
      baseFeeParams: {
        baseFeeMode:       BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: 300,    // 3% early — discourages launch snipers
          endingFeeBps:   100,    // 1% steady-state
          numberOfPeriod: 4,
          totalDuration:  7200,   // 7200 slots ≈ 48 min, then stays at 1%
        },
      },
      dynamicFeeEnabled:           true,
      collectFeeMode:              CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 33,
      poolCreationFee:             0,   // platform fee collected in TX A (0.05 SOL)
      enableFirstSwapWithMinFee:   true,
    },
    migration: {
      migrationOption:    MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.FixedBps25,
      // 2% migration fee at graduation — compensates for burning LP (no IL, but no LP revenue either).
      // Revenue model: migration fee at graduation + DAMM V2 swap fees on permanently locked LP (claimable by feeClaimer = platformWallet).
      migrationFee: { feePercentage: 2, creatorFeePercentage: 0 },
    },
    liquidityDistribution: {
      // All LP permanently locked at graduation — zero IL risk for everyone.
      // Same ratio as bonding curve (platform 67%, creator 33%):
      //   - Platform (feeClaimer = platformWallet) claims 67% of DAMM V2 swap fees
      //   - Creator claims 33% of DAMM V2 swap fees from their own locked LP
      // This preserves the creator's earning rate pre- and post-graduation.
      partnerPermanentLockedLiquidityPercentage: 67, // platform claims 67% of DAMM V2 fees
      partnerLiquidityPercentage:               0,
      creatorPermanentLockedLiquidityPercentage: 33, // creator claims 33% — same as bonding curve
      creatorLiquidityPercentage:               0,
    },
    lockedVesting: {
      totalLockedVestingAmount:       0,
      numberOfVestingPeriod:          0,
      cliffUnlockAmount:              0,
      totalVestingDuration:           0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType:     ActivationType.Slot,
    initialMarketCap:   10,        // 10 xStock tokens (~$1 500 USD at xNVDA) — minimum viable starting price
    migrationMarketCap: 10_000,    // 10 000 xStock tokens (~$1.5M USD) graduation threshold
  });

  // ── Call SDK for TX B (createConfig only) ────────────────────────────────────
  // We call buildCreateConfigTx directly instead of createConfigAndPoolWithFirstBuy
  // so we can build TX C ourselves with tokenQuoteProgram = TOKEN_2022_PROGRAM_ID.
  // The SDK's initializeSplPool hardcodes TOKEN_PROGRAM_ID for tokenQuoteProgram,
  // which fails when quoteMint is Token-2022. Calling the Anchor program method
  // directly lets us pass the correct program ID.
  let createConfigTx;
  try {
    const configParam = {
      tokenType: TokenType.SPLToken,
      ...curveParams,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createConfigTx = await (client.partner as any).buildCreateConfigTx(
      configParam,
      configKeypair.publicKey,
      platformWallet.publicKey,   // feeClaimer
      platformWallet.publicKey,   // leftoverReceiver
      quoteMint,
      platformWallet.publicKey,   // payer for config account rent
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`DBC SDK buildCreateConfigTx failed: ${msg}`);
  }

  console.log("[DBC stock] configKeypair:", configKeypair.publicKey.toBase58());
  console.log("[DBC stock] xStock quoteMint:", xStockMintStr);

  // ── Derive PDAs for pool creation ────────────────────────────────────────────
  // Replicate SDK internals (deriveDbcPoolAddress / deriveDbcTokenVaultAddress /
  // deriveMintMetadata) so we can call the Anchor method directly.
  const DBC_PROGRAM_ID_PK  = new PublicKey("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
  const METAPLEX_PROGRAM   = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
  const SPL_TOKEN_PROGRAM  = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

  const baseMintPK  = params.mintKeypair.publicKey;
  const configPK    = configKeypair.publicKey;

  const [poolAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_authority")],
    DBC_PROGRAM_ID_PK,
  );

  const isQuoteBigger = quoteMint.toBuffer().compare(baseMintPK.toBuffer()) > 0;
  const [pool] = PublicKey.findProgramAddressSync([
    Buffer.from("pool"),
    configPK.toBuffer(),
    isQuoteBigger ? quoteMint.toBuffer()    : baseMintPK.toBuffer(),
    isQuoteBigger ? baseMintPK.toBuffer()   : quoteMint.toBuffer(),
  ], DBC_PROGRAM_ID_PK);

  const [baseVault] = PublicKey.findProgramAddressSync([
    Buffer.from("token_vault"), baseMintPK.toBuffer(), pool.toBuffer(),
  ], DBC_PROGRAM_ID_PK);

  const [quoteVault] = PublicKey.findProgramAddressSync([
    Buffer.from("token_vault"), quoteMint.toBuffer(), pool.toBuffer(),
  ], DBC_PROGRAM_ID_PK);

  const [mintMetadata] = PublicKey.findProgramAddressSync([
    Buffer.from("metadata"),
    METAPLEX_PROGRAM.toBuffer(),
    baseMintPK.toBuffer(),
  ], METAPLEX_PROGRAM);

  // Build pool creation TX by calling the Anchor program directly.
  // This bypasses initializeSplPool's hardcoded TOKEN_PROGRAM_ID for tokenQuoteProgram
  // and lets us pass TOKEN_2022_PROGRAM_ID for the Token-2022 xStock quoteMint.
  let createPoolTx;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createPoolTx = await (client.partner as any).program.methods
      .initializeVirtualPoolWithSplToken({ name: params.name, symbol: params.symbol, uri: params.metadataUri })
      .accountsPartial({
        pool,
        config:            configPK,
        payer:             creator,         // creator pays rent for pool accounts
        creator,                            // poolCreator = user wallet
        mintMetadata,
        baseMint:          baseMintPK,
        poolAuthority,
        baseVault,
        quoteVault,
        quoteMint,
        tokenQuoteProgram: TOKEN_2022_PROGRAM,  // ← KEY FIX: Token-2022 for xStock quote
        metadataProgram:   METAPLEX_PROGRAM,
        tokenProgram:      SPL_TOKEN_PROGRAM,   // SPL Token for base mint creation
      })
      .transaction();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`DBC pool initializeVirtualPoolWithSplToken failed: ${msg}`);
  }

  const { Transaction } = await import("@solana/web3.js");

  // ── TX A: platform creation fee ───────────────────────────────────────────────
  const CREATION_FEE_LAMPORTS  = Math.floor(0.05 * LAMPORTS_PER_SOL);
  const SCHEDULED_FEE_LAMPORTS = Math.floor(0.10 * LAMPORTS_PER_SOL);
  const totalFeeLamports = CREATION_FEE_LAMPORTS + (params.isScheduled ? SCHEDULED_FEE_LAMPORTS : 0);

  const { blockhash: bhA } = await connection.getLatestBlockhash("confirmed");
  const txA = new Transaction({ recentBlockhash: bhA, feePayer: creator });
  txA.add(SystemProgram.transfer({
    fromPubkey: creator,
    toPubkey:   platformWallet.publicKey,
    lamports:   totalFeeLamports,
  }));

  // ── TX B: DBC config creation ─────────────────────────────────────────────────
  // Strip ComputeBudget from SDK tx — replace with explicit budget for predictable size.
  // Pre-signed by platformWallet (payer) + configKeypair (new account).
  // feePayer = creator.
  const configIxs = stripComputeBudget(createConfigTx.instructions);
  const { blockhash: bhB } = await connection.getLatestBlockhash("confirmed");
  const txB = new Transaction({ recentBlockhash: bhB, feePayer: creator });
  txB.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  for (const ix of configIxs) txB.add(ix);
  txB.compileMessage();
  try { txB.partialSign(platformWallet); } catch { /* already signed or not required */ }
  try { txB.partialSign(configKeypair);  } catch { /* new config account */  }

  // ── TX C: DBC pool creation ───────────────────────────────────────────────────
  // Creates baseMint (meme token) + Metaplex metadata + pool + vaults.
  // Pre-signed by mintKeypair (baseMint signer).
  // feePayer = creator (also covers the "payer" role in the instruction).
  const poolIxs = stripComputeBudget(createPoolTx.instructions);
  const { blockhash: bhC } = await connection.getLatestBlockhash("confirmed");
  const txC = new Transaction({ recentBlockhash: bhC, feePayer: creator });
  txC.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  for (const ix of poolIxs) txC.add(ix);
  txC.compileMessage();
  try { txC.partialSign(params.mintKeypair); } catch { /* new baseMint account */ }

  console.log("[DBC stock] TX B programs:", txB.instructions.map((ix: { programId: PublicKey }) => ix.programId.toBase58()));
  console.log("[DBC stock] TX C programs:", txC.instructions.map((ix: { programId: PublicKey }) => ix.programId.toBase58()));

  return {
    txABase64:           Buffer.from(txA.serialize({ requireAllSignatures: false })).toString("base64"),
    txBBase64:           Buffer.from(txB.serialize({ requireAllSignatures: false })).toString("base64"),
    txCBase64:           Buffer.from(txC.serialize({ requireAllSignatures: false })).toString("base64"),
    mintAddress:         params.mintKeypair.publicKey.toBase58(),
    configAddress:       configKeypair.publicKey.toBase58(),
    configKeypairSecret: Buffer.from(configKeypair.secretKey).toString("base64"),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build split transactions.
 *
 * SOL meme token path (params.stockSymbol = null):
 *   TX A — platform fee (0.05 SOL) — Blowfish-safe
 *   TX B — DBC create_virtual_pool (+ optional first buy) using pre-created DBC_CONFIG_KEY
 *   Returns { txABase64, txBBase64, mintAddress }
 *
 * xStock-paired path (params.stockSymbol set, e.g. "xNVDA"):
 *   TX A — platform fee (0.05 SOL) — Blowfish-safe
 *   TX B — DBC createConfig (fresh keypair, quoteMint = xStock) — pre-signed server-side
 *   TX C — DBC createPool (creates meme mint + metadata + pool + vaults) — pre-signed server-side
 *   Returns { txABase64, txBBase64, txCBase64, mintAddress, configAddress, configKeypairSecret }
 */
export async function buildSplitPoolTransactions(params: DbcPoolParams): Promise<{
  txABase64: string;
  txBBase64: string;
  txCBase64?: string;
  mintAddress: string;
  configAddress?: string;
  configKeypairSecret?: string;
}> {
  // xStock-paired: use createConfigAndPool (no pre-created config needed)
  if (params.stockSymbol) {
    return buildStockPairedTransactions(params);
  }

  // SOL meme token: use pre-created DBC_CONFIG_KEY config
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
  const configKey      = getSolConfigKey();
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

  // Pre-sign with mint keypair where it is a required signer.
  // IMPORTANT: tx.signatures is only populated after compileMessage() is called.
  // Without compileMessage(), the array is always empty → both flags are false
  // → mint never signs → TX B fails on-chain with "missing required signer".
  console.log("[DBC split] TX A instructions:", ixA.map((ix: { programId: PublicKey }) => ix.programId.toBase58()));
  console.log("[DBC split] TX B instructions:", ixB.map((ix: { programId: PublicKey }) => ix.programId.toBase58()));

  const mintStr = params.mintKeypair.publicKey.toBase58();
  txA.compileMessage();
  txB.compileMessage();
  const txANeedsMint = txA.signatures.some(s => s.publicKey.toBase58() === mintStr);
  const txBNeedsMint = txB.signatures.some(s => s.publicKey.toBase58() === mintStr);
  console.log("[DBC split] txA needs mint sig:", txANeedsMint, "| txB needs mint sig:", txBNeedsMint);
  // Always try to partialSign with mint keypair — some programs check for the signature
  // even when it's not listed as a required signer in the outer tx message.
  try { txA.partialSign(params.mintKeypair); } catch { /* not needed */ }
  try { txB.partialSign(params.mintKeypair); } catch { /* not needed */ }

  return {
    txABase64: Buffer.from(txA.serialize({ requireAllSignatures: false })).toString("base64"),
    txBBase64: Buffer.from(txB.serialize({ requireAllSignatures: false })).toString("base64"),
    mintAddress: params.mintKeypair.publicKey.toBase58(),
  };
}

/**
 * Build only TX B (DBC pool creation) — used when TX A (mint + fee) already
 * confirmed on a previous attempt. The mint exists on-chain; we just need the pool.
 *
 * NOT supported for xStock-paired tokens (those use buildStockPairedTransactions).
 */
export async function buildPoolOnlyTransaction(params: DbcPoolParams): Promise<{
  txBBase64: string;
  mintAddress: string;
}> {
  if (params.stockSymbol) {
    throw new Error(
      "buildPoolOnlyTransaction is not supported for xStock-paired tokens. " +
      "Use buildStockPairedTransactions instead."
    );
  }

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
  const configKey       = getSolConfigKey();
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

  // compileMessage() must be called before checking tx.signatures —
  // without it the array is always empty and partialSign is never called.
  txB.compileMessage();
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
  const configKey      = getSolConfigKey();
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
