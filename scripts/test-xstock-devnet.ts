/**
 * Devnet smoke test — Token-2022 quoteMint compatibility with Meteora DBC.
 *
 * Tests whether the DBC on-chain program accepts a Token-2022 mint as quoteMint
 * when tokenQuoteProgram = TOKEN_PROGRAM_ID (SDK hardcoded value).
 *
 * Setup:
 *   $env:SOLANA_RPC_URL = "https://api.devnet.solana.com"
 *   $env:PLATFORM_WALLET_SECRET = "<base58 secret key>"
 *   npx ts-node --skip-project scripts/test-xstock-devnet.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import { createMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";

async function main() {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("Set $env:SOLANA_RPC_URL first");
  const secret = process.env.PLATFORM_WALLET_SECRET;
  if (!secret) throw new Error("Set $env:PLATFORM_WALLET_SECRET first");

  const connection = new Connection(rpc, "confirmed");
  const platformWallet = Keypair.fromSecretKey(bs58.decode(secret));

  console.log("Wallet :", platformWallet.publicKey.toBase58());
  const balance = await connection.getBalance(platformWallet.publicKey);
  console.log("Balance:", balance / 1e9, "SOL");
  if (balance < 0.3e9) {
    throw new Error(
      "Insufficient SOL. Go to https://faucet.solana.com and airdrop 2 SOL to " +
      platformWallet.publicKey.toBase58()
    );
  }

  // ── Step 1: Create a Token-2022 mint (simulates xNVDA) ────────────────────
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

  // ── Step 2: Load DBC SDK and build transactions ───────────────────────────
  console.log("\n[2] Loading DBC SDK and building transactions…");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk") as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bnMod = await import("bn.js") as any;
  const BN = bnMod.default ?? bnMod;

  const {
    DynamicBondingCurveClient, buildCurveWithMarketCap,
    MigrationOption, MigrationFeeOption, TokenType, TokenDecimal,
    TokenAuthorityOption, ActivationType, CollectFeeMode, BaseFeeMode,
  } = sdk;

  const client = new DynamicBondingCurveClient(connection, "confirmed");
  const configKeypair = Keypair.generate();
  const mintKeypair   = Keypair.generate();

  const curveParams = buildCurveWithMarketCap({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.SIX,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: 1_000_000_000,
      leftover: 0,
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
      partnerPermanentLockedLiquidityPercentage: 0,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0, numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Slot,
    initialMarketCap: 0.001,
    migrationMarketCap: 100,
  });

  let createConfigTx: Transaction, createPoolWithFirstBuyTx: Transaction;
  try {
    ({ createConfigTx, createPoolWithFirstBuyTx } =
      await client.partner.createConfigAndPoolWithFirstBuy({
        config:           configKeypair.publicKey,
        feeClaimer:       platformWallet.publicKey,
        leftoverReceiver: platformWallet.publicKey,
        quoteMint:        fakeXStockMint,
        payer:            platformWallet.publicKey,
        tokenType:        TokenType.SPLToken,
        ...curveParams,
        preCreatePoolParam: {
          name: "TestXStock", symbol: "TXS",
          uri: "https://example.com/meta.json",
          poolCreator: platformWallet.publicKey,
          baseMint: mintKeypair.publicKey,
        },
        firstBuyParam: {
          buyer: platformWallet.publicKey,
          buyAmount: new BN(0),
          minimumAmountOut: new BN(0),
          referralTokenAccount: null,
        },
      }));
    console.log("✅ SDK built transactions");
  } catch (err) {
    console.error("❌ SDK build failed:", err);
    process.exit(1);
  }

  // ── Step 3: Send TX B (createConfig) ─────────────────────────────────────
  console.log("\n[3] Sending TX B — createConfig…");
  const { blockhash: bhB, lastValidBlockHeight: lvhB } =
    await connection.getLatestBlockhash("confirmed");
  createConfigTx.recentBlockhash = bhB;
  createConfigTx.feePayer = platformWallet.publicKey;

  try {
    const sigB = await sendAndConfirmTransaction(
      connection, createConfigTx,
      [platformWallet, configKeypair],
      { commitment: "confirmed", lastValidBlockHeight: lvhB }
    );
    console.log("✅ TX B confirmed:", sigB);
    console.log("   Config:", configKeypair.publicKey.toBase58());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ TX B FAILED:", msg);
    console.error("\n── Diagnostic ──────────────────────────────────────────────");
    if (/InvalidAccountData|TokenProgramMismatch|IncorrectProgramId/i.test(msg)) {
      console.error("→ Le programme DBC valide tokenQuoteProgram contre l'owner du quoteMint.");
      console.error("→ Il faut passer TOKEN_2022_PROGRAM_ID — chercher un paramètre dans le SDK.");
    } else {
      console.error("→ Erreur inattendue — partage le message complet pour diagnostic.");
    }
    process.exit(1);
  }

  // ── Step 4: Send TX C (createPool) ───────────────────────────────────────
  console.log("\n[4] Sending TX C — createPool…");
  const { blockhash: bhC, lastValidBlockHeight: lvhC } =
    await connection.getLatestBlockhash("confirmed");
  createPoolWithFirstBuyTx.recentBlockhash = bhC;
  createPoolWithFirstBuyTx.feePayer = platformWallet.publicKey;

  try {
    const sigC = await sendAndConfirmTransaction(
      connection, createPoolWithFirstBuyTx,
      [platformWallet, mintKeypair],
      { commitment: "confirmed", lastValidBlockHeight: lvhC }
    );
    console.log("✅ TX C confirmed:", sigC);
    console.log("\n🎉 COMPATIBLE — Token-2022 quoteMint fonctionne avec DBC.");
    console.log("   Le flow xStock est prêt pour mainnet.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ TX C FAILED:", msg);
    console.error("\n── Diagnostic ──────────────────────────────────────────────");
    if (/InvalidAccountData|TokenProgramMismatch|IncorrectProgramId/i.test(msg)) {
      console.error("→ initializeSplPool valide tokenQuoteProgram au niveau de la pool.");
      console.error("→ Même fix nécessaire : passer TOKEN_2022_PROGRAM_ID dans les instructions.");
    } else {
      console.error("→ Erreur inattendue — partage le message complet pour diagnostic.");
    }
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
