/**
 * Devnet smoke test — Token-2022 quoteMint + Meteora DBC compatibility.
 * Run: node scripts/test-xstock-devnet.mjs
 */

import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import BN from "bn.js";
import {
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
} from "@meteora-ag/dynamic-bonding-curve-sdk";

const rpc    = process.env.SOLANA_RPC_URL;
const secret = process.env.PLATFORM_WALLET_SECRET;
if (!rpc)    throw new Error("Set $env:SOLANA_RPC_URL first");
if (!secret) throw new Error("Set $env:PLATFORM_WALLET_SECRET first");

const connection     = new Connection(rpc, "confirmed");
const platformWallet = Keypair.fromSecretKey(bs58.decode(secret));

console.log("Wallet :", platformWallet.publicKey.toBase58());
const balance = await connection.getBalance(platformWallet.publicKey);
console.log("Balance:", balance / 1e9, "SOL");
if (balance < 0.3e9) {
  throw new Error(
    "Insufficient SOL — go to https://faucet.solana.com and airdrop 2 SOL to:\n" +
    platformWallet.publicKey.toBase58()
  );
}

// ── Step 1: Create a Token-2022 mint ────────────────────────────────────────
console.log("\n[1] Creating Token-2022 mint (fake xStock)…");
const fakeXStockMint = await createMint(
  connection,
  platformWallet,
  platformWallet.publicKey,
  null,
  6,
  undefined,
  undefined,
  TOKEN_2022_PROGRAM_ID,
);
console.log("✅ Token-2022 mint:", fakeXStockMint.toBase58());

// ── Step 2: Build DBC transactions ──────────────────────────────────────────
console.log("\n[2] Building DBC transactions…");
const client        = new DynamicBondingCurveClient(connection, "confirmed");
const configKeypair = Keypair.generate();
const mintKeypair   = Keypair.generate();

const curveParams = buildCurveWithMarketCap({
  token: {
    tokenType: TokenType.SPLToken,
    tokenBaseDecimal: TokenDecimal.SIX,
    tokenQuoteDecimal: TokenDecimal.SIX,
    tokenAuthorityOption: TokenAuthorityOption.Immutable,
    totalTokenSupply: 1_000_000_000,
    leftover: 100_000_000,   // 10% leftover → absorbe l'écart de précision curve vs tokenSupply
  },
  fee: {
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: { startingFeeBps: 300, endingFeeBps: 100, numberOfPeriod: 4, totalDuration: 7200 },
    },
    dynamicFeeEnabled: true,
    collectFeeMode: CollectFeeMode.QuoteToken,
    creatorTradingFeePercentage: 33,
    poolCreationFee: 0,
    enableFirstSwapWithMinFee: true,
  },
  migration: {
    migrationOption: MigrationOption.MET_DAMM_V2,
    migrationFeeOption: MigrationFeeOption.FixedBps25,
    migrationFee: { feePercentage: 1, creatorFeePercentage: 0 },
  },
  liquidityDistribution: {
    partnerPermanentLockedLiquidityPercentage: 10,  // SDK requires >= 10% permanently locked at day 1
    partnerLiquidityPercentage:               90,  // sum must = 100
    creatorPermanentLockedLiquidityPercentage: 0,
    creatorLiquidityPercentage:               0,
  },
  lockedVesting: {
    totalLockedVestingAmount: 0, numberOfVestingPeriod: 0,
    cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0,
  },
  activationType: ActivationType.Slot,
  initialMarketCap: 10,        // 10 xStock tokens (~$1500 at xNVDA)
  migrationMarketCap: 10_000,  // 10k xStock tokens (~$1.5M) graduation threshold
});

// ── TX B: createConfig via SDK ───────────────────────────────────────────────
let createConfigTx;
try {
  const configParam = { tokenType: TokenType.SPLToken, ...curveParams };
  createConfigTx = await client.partner.buildCreateConfigTx(
    configParam,
    configKeypair.publicKey,
    platformWallet.publicKey,  // feeClaimer
    platformWallet.publicKey,  // leftoverReceiver
    fakeXStockMint,
    platformWallet.publicKey,  // payer for config rent
  );
  console.log("── curveParams debug ──────────────────────────────────────");
  console.log("  tokenSupply.preMigration :", curveParams.tokenSupply?.preMigrationTokenSupply?.toString());
  console.log("  tokenSupply.postMigration:", curveParams.tokenSupply?.postMigrationTokenSupply?.toString());
  console.log("  sqrtStartPrice           :", curveParams.sqrtStartPrice?.toString());
  console.log("  migrationQuoteThreshold  :", curveParams.migrationQuoteThreshold?.toString());
  console.log("────────────────────────────────────────────────────────────");
  console.log("✅ SDK built createConfig TX");
} catch (err) {
  console.error("❌ SDK buildCreateConfigTx failed:", err);
  process.exit(1);
}

// ── TX C: createPool via Anchor program directly (bypasses hardcoded TOKEN_PROGRAM_ID) ─
// The SDK's initializeSplPool hardcodes tokenQuoteProgram = TOKEN_PROGRAM_ID, which
// causes IncorrectProgramId when quoteMint is Token-2022. We call the Anchor method
// directly so we can pass TOKEN_2022_PROGRAM_ID as tokenQuoteProgram.
const DBC_PROGRAM_ID  = new PublicKey("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
const METAPLEX_PROG   = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SPL_TOKEN_PROG  = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const baseMintPK = mintKeypair.publicKey;
const [poolAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from("pool_authority")], DBC_PROGRAM_ID
);
const isQuoteBigger = fakeXStockMint.toBuffer().compare(baseMintPK.toBuffer()) > 0;
const [pool] = PublicKey.findProgramAddressSync([
  Buffer.from("pool"),
  configKeypair.publicKey.toBuffer(),
  isQuoteBigger ? fakeXStockMint.toBuffer() : baseMintPK.toBuffer(),
  isQuoteBigger ? baseMintPK.toBuffer()     : fakeXStockMint.toBuffer(),
], DBC_PROGRAM_ID);
const [baseVault]  = PublicKey.findProgramAddressSync(
  [Buffer.from("token_vault"), baseMintPK.toBuffer(), pool.toBuffer()], DBC_PROGRAM_ID
);
const [quoteVault] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_vault"), fakeXStockMint.toBuffer(), pool.toBuffer()], DBC_PROGRAM_ID
);
const [mintMetadata] = PublicKey.findProgramAddressSync([
  Buffer.from("metadata"), METAPLEX_PROG.toBuffer(), baseMintPK.toBuffer(),
], METAPLEX_PROG);

let createPoolTx;
try {
  createPoolTx = await client.partner.program.methods
    .initializeVirtualPoolWithSplToken({ name: "TestXStock", symbol: "TXS", uri: "https://example.com/meta.json" })
    .accountsPartial({
      pool,
      config:            configKeypair.publicKey,
      payer:             platformWallet.publicKey,  // pays pool account rents
      creator:           platformWallet.publicKey,  // poolCreator
      mintMetadata,
      baseMint:          baseMintPK,
      poolAuthority,
      baseVault,
      quoteVault,
      quoteMint:         fakeXStockMint,
      tokenQuoteProgram: TOKEN_2022_PROGRAM_ID,  // ← KEY FIX: Token-2022 for xStock quote
      metadataProgram:   METAPLEX_PROG,
      tokenProgram:      SPL_TOKEN_PROG,
    })
    .transaction();
  console.log("✅ Pool TX built with TOKEN_2022_PROGRAM_ID as tokenQuoteProgram");
} catch (err) {
  console.error("❌ Pool TX build failed:", err);
  process.exit(1);
}

// ── Step 3: Send TX B (createConfig) ────────────────────────────────────────
console.log("\n[3] Sending TX B — createConfig…");
const { blockhash: bhB } = await connection.getLatestBlockhash("confirmed");
createConfigTx.recentBlockhash = bhB;
createConfigTx.feePayer = platformWallet.publicKey;

try {
  const sigB = await sendAndConfirmTransaction(
    connection, createConfigTx,
    [platformWallet, configKeypair],
    { commitment: "confirmed" }
  );
  console.log("✅ TX B confirmed:", sigB);
  console.log("   Config:", configKeypair.publicKey.toBase58());
} catch (err) {
  const msg = err?.message ?? String(err);
  console.error("❌ TX B FAILED:", msg);
  if (/InvalidAccountData|TokenProgramMismatch|IncorrectProgramId/i.test(msg)) {
    console.error("\n→ Le programme DBC valide tokenQuoteProgram — Token-2022 non supporté tel quel.");
    console.error("→ Fix nécessaire : trouver comment passer TOKEN_2022_PROGRAM_ID au SDK.");
  }
  process.exit(1);
}

// ── Step 4: Send TX C (createPool) ──────────────────────────────────────────
console.log("\n[4] Sending TX C — createPool (with TOKEN_2022_PROGRAM_ID for tokenQuoteProgram)…");
const { blockhash: bhC } = await connection.getLatestBlockhash("confirmed");
createPoolTx.recentBlockhash = bhC;
createPoolTx.feePayer = platformWallet.publicKey;

try {
  const sigC = await sendAndConfirmTransaction(
    connection, createPoolTx,
    [platformWallet, mintKeypair],
    { commitment: "confirmed" }
  );
  console.log("✅ TX C confirmed:", sigC);
  console.log("   Pool:", pool.toBase58());
  console.log("\n🎉 COMPATIBLE — Token-2022 quoteMint fonctionne avec DBC.");
  console.log("   Le flow xStock est prêt pour mainnet.");
} catch (err) {
  const msg = err?.message ?? String(err);
  console.error("❌ TX C FAILED:", msg);
  if (/InvalidAccountData|TokenProgramMismatch|IncorrectProgramId/i.test(msg)) {
    console.error("\n→ L'instruction on-chain valide encore tokenQuoteProgram.");
    console.error("→ DBC ne supporte peut-être pas SPL base + Token-2022 quote.");
  }
  process.exit(1);
}
