#!/usr/bin/env node
/**
 * Crée UNE FOIS les configs Meteora (DBC) des lancements en paire PEPE ou ClawdTrust (CLT) sur Solana.
 * (Copie du script DOGE, scripts/create-doge-config.mjs, qui reste inchangé.)
 * Mêmes règles que les lancements en SOL : frais fixes 2 % (créateur 57 %) ou 1,25 % (créateur 50 %), migration vers
 * DAMM v2, liquidité bloquée à vie (plateforme 67 %, créateur 33 %), offre de 1 milliard, 6 décimales.
 *
 *   node scripts/create-pair-config.mjs --quote pepe --dry-run   (affiche les paramètres, n'envoie rien)
 *   node scripts/create-pair-config.mjs --quote pepe             (envoie, payé par le wallet de la plateforme)
 *   Options : --initial …  --migration …   (capitalisations dans la monnaie de paire : départ et graduation)
 *   PEPE : par défaut 1 milliard au départ (≈ 4 000 $) et 17,7 milliards à la graduation (≈ 70 000 $).
 *   CLT : pas de valeur par défaut, --initial et --migration sont obligatoires (le CLT a peu de liquidité).
 *
 * Ensuite, dans .env.local du serveur : DBC_CONFIG_KEY_PEPE=…  DBC_CONFIG_KEY_PEPE_LOW=…  NEXT_PUBLIC_PEPE_LAUNCH=1
 * (ou DBC_CONFIG_KEY_CLT, DBC_CONFIG_KEY_CLT_LOW, NEXT_PUBLIC_CLT_LAUNCH=1)
 * Lit SOLANA_RPC_URL et PLATFORM_WALLET_SECRET dans .env.local (jamais affichés).
 */
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const QUOTES = {
  pepe: { symbol: "PEPE", mint: "PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m", decimals: 4, initial: 1_000_000_000, migration: 17_700_000_000 },
  clt: { symbol: "CLT", mint: "DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS", decimals: 9, initial: undefined, migration: undefined },
};
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const qi = args.indexOf("--quote");
const Q = QUOTES[qi >= 0 ? args[qi + 1] : ""];
if (!Q) { console.error("Usage: node scripts/create-pair-config.mjs --quote pepe|clt [--initial N --migration N] [--dry-run]"); process.exit(1); }
const DRY = args.includes("--dry-run");
const INITIAL = arg("--initial", Q.initial);
const MIGRATION = arg("--migration", Q.migration);
if (!INITIAL || !MIGRATION) { console.error(`--initial and --migration are required for ${Q.symbol}`); process.exit(1); }
const ENV = `DBC_CONFIG_KEY_${Q.symbol}`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env.local");
const env = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })) : {};

const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
const { DynamicBondingCurveClient, buildCurveWithMarketCap, MigrationOption, MigrationFeeOption, TokenType, TokenDecimal, TokenAuthorityOption, ActivationType, CollectFeeMode, BaseFeeMode } = sdk;

function curve(tier) {
  return buildCurveWithMarketCap({
    token: { tokenType: TokenType.SPLToken, tokenBaseDecimal: TokenDecimal.SIX, tokenQuoteDecimal: Q.decimals, tokenAuthorityOption: TokenAuthorityOption.Immutable, totalTokenSupply: 1_000_000_000, leftover: 100_000_000 },
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

console.log(`${Q.symbol} configs: start ${INITIAL.toLocaleString()} ${Q.symbol}, graduation ${MIGRATION.toLocaleString()} ${Q.symbol}`);
if (DRY) { for (const t of ["standard", "low"]) { const c = curve(t); console.log(t, "migrationQuoteThreshold:", c.migrationQuoteThreshold?.toString?.()); } process.exit(0); }

if (!env.PLATFORM_WALLET_SECRET || !env.SOLANA_RPC_URL) { console.error("PLATFORM_WALLET_SECRET and SOLANA_RPC_URL are required in .env.local"); process.exit(1); }
const platform = Keypair.fromSecretKey(bs58.decode(env.PLATFORM_WALLET_SECRET));
const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
const client = new DynamicBondingCurveClient(connection, "confirmed");
const out = {};
for (const tier of ["standard", "low"]) {
  const cfg = Keypair.generate();
  const tx = await client.partner.buildCreateConfigTx({ tokenType: TokenType.SPLToken, ...curve(tier) }, cfg.publicKey, platform.publicKey, platform.publicKey, new PublicKey(Q.mint), platform.publicKey);
  tx.feePayer = platform.publicKey;
  const sig = await sendAndConfirmTransaction(connection, tx, [platform, cfg]);
  out[tier === "low" ? `${ENV}_LOW` : ENV] = cfg.publicKey.toBase58();
  console.log(`${tier}: ${cfg.publicKey.toBase58()} (tx ${sig})`);
}
console.log("\nAdd to .env.local:");
for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
console.log(`NEXT_PUBLIC_${Q.symbol}_LAUNCH=1`);
