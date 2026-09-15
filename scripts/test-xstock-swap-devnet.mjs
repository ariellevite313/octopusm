/**
 * Devnet smoke test — Token-2022 quoteMint swap via Meteora DBC.
 *
 * Tests whether client.pool.swap() correctly handles Token-2022 as quote token,
 * or whether it hardcodes TOKEN_PROGRAM_ID (same bug we hit with initializeSplPool).
 *
 * Run:
 *   node scripts/test-xstock-swap-devnet.mjs
 *
 * Requires:
 *   $env:SOLANA_RPC_URL        = "https://api.devnet.solana.com"
 *   $env:PLATFORM_WALLET_SECRET = "<your devnet wallet secret>"
 */

import {
  Connection, Keypair, PublicKey,
  sendAndConfirmTransaction, SystemProgram, Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  createMint, mintTo, getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import BN from "bn.js";
import {
  DynamicBondingCurveClient,
  buildCurveWithMarketCap,
  MigrationOption, MigrationFeeOption,
  TokenType, TokenDecimal, TokenAuthorityOption,
  ActivationType, CollectFeeMode, BaseFeeMode,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

const rpc    = process.env.SOLANA_RPC_URL;
const secret = process.env.PLATFORM_WALLET_SECRET;
if (!rpc)    throw new Error("Set $env:SOLANA_RPC_URL first");
if (!secret) throw new Error("Set $env:PLATFORM_WALLET_SECRET first");

const connection     = new Connection(rpc, "confirmed");
const platformWallet = Keypair.fromSecretKey(bs58.decode(secret));

console.log("Wallet :", platformWallet.publicKey.toBase58());
const balance = await connection.getBalance(platformWallet.publicKey);
console.log("Balance:", balance / 1e9, "SOL\n");
if (balance < 0.5e9) throw new Error("Need ≥0.5 SOL on devnet — airdrop at https://faucet.solana.com");

const DBC_PROGRAM_ID  = new PublicKey("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
const METAPLEX_PROG   = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SPL_TOKEN_PROG  = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const COMPUTE_BUDGET  = "ComputeBudget111111111111111111111111111111";

const client = new DynamicBondingCurveClient(connection, "confirmed");

// ── Step 1: Create fake Token-2022 xStock mint ──────────────────────────────
console.log("[1] Creating fake Token-2022 mint…");
const fakeXStockMint = await createMint(
  connection, platformWallet, platformWallet.publicKey, null, 6,
  undefined, undefined, TOKEN_2022_PROGRAM_ID,
);
console.log("✅ Fake xStock mint:", fakeXStockMint.toBase58());

// ── Step 2: Mint some fake xStock to platformWallet ─────────────────────────
// We need xStock to pay for a BUY swap (xStock → meme token)
console.log("\n[2] Minting 1000 fake xStock tokens to wallet…");
const walletXStockAta = await getOrCreateAssociatedTokenAccount(
  connection, platformWallet, fakeXStockMint,
  platformWallet.publicKey, false, "confirmed", undefined,
  TOKEN_2022_PROGRAM_ID,
);
await mintTo(
  connection, platformWallet, fakeXStockMint,
  walletXStockAta.address, platformWallet,
  1_000 * 1_000_000,  // 1000 tokens, 6 decimals
  [], undefined, TOKEN_2022_PROGRAM_ID,
);
const ataBalance = await connection.getTokenAccountBalance(walletXStockAta.address);
console.log("✅ xStock ATA:", walletXStockAta.address.toBase58());
console.log("   Balance:", ataBalance.value.uiAmount, "xStock");

// ── Step 3: Build & send TX B (createConfig) ────────────────────────────────
console.log("\n[3] Creating DBC config (TX B)…");
const configKeypair = Keypair.generate();
const mintKeypair   = Keypair.generate();

const curveParams = buildCurveWithMarketCap({
  token: {
    tokenType: TokenType.SPLToken,
    tokenBaseDecimal: TokenDecimal.SIX,
    tokenQuoteDecimal: TokenDecimal.SIX,
    tokenAuthorityOption: TokenAuthorityOption.Immutable,
    totalTokenSupply: 1_000_000_000,
    leftover: 100_000_000,
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
    partnerPermanentLockedLiquidityPercentage: 10,
    partnerLiquidityPercentage: 90,
    creatorPermanentLockedLiquidityPercentage: 0,
    creatorLiquidityPercentage: 0,
  },
  lockedVesting: {
    totalLockedVestingAmount: 0, numberOfVestingPeriod: 0,
    cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0,
  },
  activationType: ActivationType.Slot,
  initialMarketCap: 10,
  migrationMarketCap: 10_000,
});

const createConfigTx = await client.partner.buildCreateConfigTx(
  { tokenType: TokenType.SPLToken, ...curveParams },
  configKeypair.publicKey,
  platformWallet.publicKey,
  platformWallet.publicKey,
  fakeXStockMint,
  platformWallet.publicKey,
);

const { blockhash: bhB } = await connection.getLatestBlockhash("confirmed");
const txB = new Transaction({ recentBlockhash: bhB, feePayer: platformWallet.publicKey });
txB.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
for (const ix of createConfigTx.instructions.filter(ix => ix.programId.toBase58() !== COMPUTE_BUDGET)) {
  txB.add(ix);
}
const sigB = await sendAndConfirmTransaction(connection, txB, [platformWallet, configKeypair], { commitment: "confirmed" });
console.log("✅ TX B confirmed:", sigB);
console.log("   Config:", configKeypair.publicKey.toBase58());

// ── Step 4: Build & send TX C (createPool) ──────────────────────────────────
console.log("\n[4] Creating DBC pool (TX C)…");
const baseMintPK = mintKeypair.publicKey;
const configPK   = configKeypair.publicKey;

const [poolAuthority] = PublicKey.findProgramAddressSync([Buffer.from("pool_authority")], DBC_PROGRAM_ID);
const isQuoteBigger   = fakeXStockMint.toBuffer().compare(baseMintPK.toBuffer()) > 0;
const [pool]          = PublicKey.findProgramAddressSync([
  Buffer.from("pool"), configPK.toBuffer(),
  isQuoteBigger ? fakeXStockMint.toBuffer() : baseMintPK.toBuffer(),
  isQuoteBigger ? baseMintPK.toBuffer()     : fakeXStockMint.toBuffer(),
], DBC_PROGRAM_ID);
const [baseVault]  = PublicKey.findProgramAddressSync([Buffer.from("token_vault"), baseMintPK.toBuffer(), pool.toBuffer()], DBC_PROGRAM_ID);
const [quoteVault] = PublicKey.findProgramAddressSync([Buffer.from("token_vault"), fakeXStockMint.toBuffer(), pool.toBuffer()], DBC_PROGRAM_ID);
const [mintMetadata] = PublicKey.findProgramAddressSync([
  Buffer.from("metadata"), METAPLEX_PROG.toBuffer(), baseMintPK.toBuffer(),
], METAPLEX_PROG);

const createPoolTx = await client.partner.program.methods
  .initializeVirtualPoolWithSplToken({ name: "SwapTest", symbol: "SWT", uri: "https://example.com/meta.json" })
  .accountsPartial({
    pool, config: configPK, payer: platformWallet.publicKey, creator: platformWallet.publicKey,
    mintMetadata, baseMint: baseMintPK, poolAuthority, baseVault, quoteVault,
    quoteMint: fakeXStockMint, tokenQuoteProgram: TOKEN_2022_PROGRAM_ID,
    metadataProgram: METAPLEX_PROG, tokenProgram: SPL_TOKEN_PROG,
  })
  .transaction();

const { blockhash: bhC } = await connection.getLatestBlockhash("confirmed");
const txC = new Transaction({ recentBlockhash: bhC, feePayer: platformWallet.publicKey });
txC.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
for (const ix of createPoolTx.instructions.filter(ix => ix.programId.toBase58() !== COMPUTE_BUDGET)) {
  txC.add(ix);
}
const sigC = await sendAndConfirmTransaction(connection, txC, [platformWallet, mintKeypair], { commitment: "confirmed" });
console.log("✅ TX C confirmed:", sigC);
console.log("   Pool:", pool.toBase58());

// ── Step 5: Attempt swap via SDK (BUY: 1 xStock → meme token) ───────────────
console.log("\n[5] Testing BUY swap via SDK client.pool.swap()…");
console.log("    Direction: BUY (xStock → meme token), 1 xStock in");

const BUY_AMOUNT = new BN(1_000_000);  // 1 xStock (6 decimals)

let sdkSwapWorked = false;
try {
  const swapTx = await client.pool.swap({
    owner:                platformWallet.publicKey,
    pool,
    amountIn:             BUY_AMOUNT,
    minimumAmountOut:     new BN(0),
    swapBaseForQuote:     false,  // false = buy (quote → base)
    referralTokenAccount: null,
  });

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  swapTx.recentBlockhash = swapTx.recentBlockhash ?? blockhash;
  swapTx.feePayer        = swapTx.feePayer ?? platformWallet.publicKey;

  const sigSwap = await sendAndConfirmTransaction(connection, swapTx, [platformWallet], { commitment: "confirmed" });
  console.log("✅ SDK swap confirmed:", sigSwap);
  sdkSwapWorked = true;
} catch (err) {
  const msg = err?.message ?? String(err);
  console.error("❌ SDK swap FAILED:", msg);

  if (/IncorrectProgramId/i.test(msg)) {
    console.error("\n→ CONFIRMED: client.pool.swap() hardcodes TOKEN_PROGRAM_ID for tokenQuoteProgram.");
    console.error("→ Same bug as initializeSplPool. Fix needed in dbc-swap/route.ts.\n");
    console.log("[5b] Attempting Anchor bypass for swap…");

    // ── Anchor bypass for swap ────────────────────────────────────────────────
    // Find the correct account layout for the swap instruction.
    // The Anchor IDL defines the accounts; we override tokenQuoteProgram.
    try {
      // Try swapQuote first to get minimumAmountOut
      let minimumAmountOut = new BN(0);
      try {
        const virtualPool = await client.state.getPool(pool);
        const config      = await client.state.getPoolConfig(virtualPool.poolState.config);
        const quote = client.pool.swapQuote({
          virtualPool, config,
          swapBaseForQuote: false, amountIn: BUY_AMOUNT,
          slippageBps: 500, hasReferral: false, currentPoint: null,
          eligibleForFirstSwapWithMinFee: false,
        });
        minimumAmountOut = quote.minimumAmountOut ?? new BN(0);
        console.log("    estimatedOut:", quote.outputAmount.toString(), "base token units");
      } catch (qErr) {
        console.warn("    (quote estimation failed, using 0 as minimumAmountOut)");
      }

      // Derive user ATAs
      const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");

      const userQuoteAta = getAssociatedTokenAddressSync(
        fakeXStockMint, platformWallet.publicKey, false, TOKEN_2022_PROGRAM_ID,
      );
      const userBaseAta = getAssociatedTokenAddressSync(
        baseMintPK, platformWallet.publicKey, false,
      );

      // Create base token ATA if needed
      const { blockhash: bhSwap } = await connection.getLatestBlockhash("confirmed");
      const txSwap = new Transaction({ recentBlockhash: bhSwap, feePayer: platformWallet.publicKey });
      txSwap.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));

      const baseAtaInfo = await connection.getAccountInfo(userBaseAta);
      if (!baseAtaInfo) {
        txSwap.add(createAssociatedTokenAccountInstruction(
          platformWallet.publicKey, userBaseAta, platformWallet.publicKey, baseMintPK,
        ));
      }

      // Build swap via Anchor program directly
      const anchorSwapTx = await client.pool.program.methods
        .swap(BUY_AMOUNT, minimumAmountOut, false)
        .accountsPartial({
          pool,
          poolAuthority,
          config:             configPK,
          inputTokenAccount:  userQuoteAta,     // user pays xStock
          outputTokenAccount: userBaseAta,      // user receives meme token
          baseVault,
          quoteVault,
          baseMint:          baseMintPK,
          quoteMint:         fakeXStockMint,
          tokenBaseProgram:  new PublicKey(SPL_TOKEN_PROG),
          tokenQuoteProgram: TOKEN_2022_PROGRAM_ID,
          owner:             platformWallet.publicKey,
          referralTokenAccount: null,
        })
        .transaction();

      for (const ix of anchorSwapTx.instructions) txSwap.add(ix);
      const sigAnchorSwap = await sendAndConfirmTransaction(connection, txSwap, [platformWallet], { commitment: "confirmed" });
      console.log("✅ Anchor bypass swap confirmed:", sigAnchorSwap);
      console.log("\n⚠️  FIX REQUIRED in dbc-swap/route.ts:");
      console.log("   Replace client.pool.swap() with Anchor program.methods.swap() directly,");
      console.log("   passing tokenQuoteProgram: TOKEN_2022_PROGRAM_ID for xStock pools.");
    } catch (anchorErr) {
      console.error("❌ Anchor bypass also failed:", anchorErr?.message ?? String(anchorErr));
      console.error("   Check accounts layout — IDL method name or account keys may differ.");
    }
  } else {
    console.error("   (Not an IncorrectProgramId error — different issue)");
    console.error("   Full error:", err);
  }
}

// ── Final report ─────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════");
if (sdkSwapWorked) {
  console.log("🎉 SDK client.pool.swap() works natively with Token-2022 quote.");
  console.log("   No fix needed in dbc-swap/route.ts.");
  console.log("   Pool:", pool.toBase58());
} else {
  console.log("🔧 dbc-swap/route.ts needs the Anchor bypass for xStock pools.");
  console.log("   See the fix printed above.");
}
console.log("═══════════════════════════════════════════════════════════");
