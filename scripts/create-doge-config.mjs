#!/usr/bin/env node
/**
 * Crée UNE FOIS les configs Meteora (DBC) des lancements DSOL-20 : paire DOGE sur Solana.
 * Mêmes règles que les lancements en SOL : frais fixes 2 % (créateur 57 %) ou 1,25 % (créateur 50 %), migration vers
 * DAMM v2, liquidité bloquée à vie (plateforme 67 %, créateur 33 %), offre de 1 milliard, 6 décimales.
 *
 *   node scripts/create-doge-config.mjs --dry-run           (affiche les paramètres, n'envoie rien)
 *   node scripts/create-doge-config.mjs                      (envoie, payé par le wallet de la plateforme)
 *   Options : --initial 68000  --migration 1200000          (capitalisations en DOGE : départ et graduation)
 *
 * Ensuite, dans .env.local du serveur : DBC_CONFIG_KEY_DOGE=…  DBC_CONFIG_KEY_DOGE_LOW=…  NEXT_PUBLIC_DOGE_LAUNCH=1
 * Lit SOLANA_RPC_URL et PLATFORM_WALLET_SECRET dans .env.local (jamais affichés).
 */
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const DOGE_MINT = "DoGEV7LASBkQbibMc5k5vKnTZoMg423GpJ5QtJEGfm7R";
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const DRY = args.includes("--dry-run");
const INITIAL = arg("--initial", 68_000);      // ≈ 4 000 $ à 0,059 $ le DOGE
const MIGRATION = arg("--migration", 1_200_000); // ≈ 70 000 $

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env.local");
const env = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })) : {};

const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
const { DynamicBondingCurveClient, buildCurveWithMarketCap, MigrationOption, MigrationFeeOption, TokenType, TokenDecimal, TokenAuthorityOption, ActivationType, CollectFeeMode, BaseFeeMode } = sdk;

function curve(tier) {
  return buildCurveWithMarketCap({
    token: { tokenType: TokenType.SPLToken, tokenBaseDecimal: TokenDecimal.SIX, tokenQuoteDecimal: TokenDecimal.EIGHT, tokenAuthorityOption: TokenAuthorityOption.Immutable, totalTokenSupply: 1_000_000_000, leftover: 100_000_000 },
    fee: {
      baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerLinear, feeSchedulerParam: { startingFeeBps: tier === "low" ? 125 : 200, endingFeeBps: tier === "low" ? 125 : 200, numberOfPeriod: 0, totalDuration: 0 } },
      dynamicFeeEnabled: true, collectFeeMode: CollectFeeMode.QuoteToken, creatorTradingFeePercentage: tier === "low" ? 50 : 57, poolCreationFee: 0, enableFirstSwapWithMinFee: true,
    },
    migration: { migrationOption: MigrationOption.MET_DAMM_V2, migrationFeeOption: MigrationFeeOption.FixedBps25, migrationFee: { feePercentage: 2, creatorFeePercentage: 0 } },
    liquidityDistribution: { partnerPermanentLockedLiquidityPercentage: 67, partnerLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 33, creatorLiquidityPercentage: 0 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Slot,
    initialMarketCap: INITIAL,
    migrationMarketCap: MIGRATION,
  });
}

console.log(`DOGE configs: start ${INITIAL.toLocaleString()} DOGE, graduation ${MIGRATION.toLocaleString()} DOGE`);
if (DRY) { for (const t of ["standard", "low"]) { const c = curve(t); console.log(t, "migrationQuoteThreshold:", c.migrationQuoteThreshold?.toString?.()); } process.exit(0); }

if (!env.PLATFORM_WALLET_SECRET || !env.SOLANA_RPC_URL) { console.error("PLATFORM_WALLET_SECRET and SOLANA_RPC_URL are required in .env.local"); process.exit(1); }
const platform = Keypair.fromSecretKey(bs58.decode(env.PLATFORM_WALLET_SECRET));
const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
const client = new DynamicBondingCurveClient(connection, "confirmed");
const out = {};
for (const tier of ["standard", "low"]) {
  const cfg = Keypair.generate();
  const tx = await client.partner.buildCreateConfigTx({ tokenType: TokenType.SPLToken, ...curve(tier) }, cfg.publicKey, platform.publicKey, platform.publicKey, new PublicKey(DOGE_MINT), platform.publicKey);
  tx.feePayer = platform.publicKey;
  const sig = await sendAndConfirmTransaction(connection, tx, [platform, cfg]);
  out[tier === "low" ? "DBC_CONFIG_KEY_DOGE_LOW" : "DBC_CONFIG_KEY_DOGE"] = cfg.publicKey.toBase58();
  console.log(`${tier}: ${cfg.publicKey.toBase58()} (tx ${sig})`);
}
console.log("\nAdd to .env.local:");
for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
console.log("NEXT_PUBLIC_DOGE_LAUNCH=1");
