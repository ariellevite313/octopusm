/**
 * Vérifie le config DBC on-chain.
 * Affiche : partnerAddress, feeSplit creator/partner, clé plateforme.
 *
 * Usage :
 *   npx ts-node -e "$(cat scripts/check-dbc-config.ts)"
 * ou
 *   npx tsx scripts/check-dbc-config.ts
 */

import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

async function main() {
  const rpc       = process.env.SOLANA_RPC_URL!;
  const secret    = process.env.PLATFORM_WALLET_SECRET!;
  const configKey = process.env.DBC_CONFIG_KEY!;

  if (!rpc || !secret || !configKey) {
    console.error("❌ Missing env vars: SOLANA_RPC_URL, PLATFORM_WALLET_SECRET, DBC_CONFIG_KEY");
    process.exit(1);
  }

  const connection     = new Connection(rpc, "confirmed");
  const platformWallet = Keypair.fromSecretKey(bs58.decode(secret));
  const configPubkey   = new PublicKey(configKey);

  console.log("\n─── OMdotfun DBC Config Verification ───\n");
  console.log("DBC_CONFIG_KEY    :", configKey);
  console.log("Platform wallet   :", platformWallet.publicKey.toBase58());

  // Load DBC SDK
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sdk = require("@meteora-ag/dynamic-bonding-curve-sdk");
  const DynamicBondingCurveClient = sdk.DynamicBondingCurveClient;
  const client = new DynamicBondingCurveClient(connection, "confirmed");

  // Fetch config
  let config: Record<string, unknown>;
  try {
    config = await client.getConfig(configPubkey);
  } catch (e) {
    console.error("❌ Failed to fetch config:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  console.log("\n─── Config on-chain ───\n");
  console.log(JSON.stringify(config, null, 2));

  // Key check
  const partnerAddr =
    (config.partnerAddress as PublicKey | undefined)?.toBase58?.() ??
    (config.partner_address as string | undefined) ??
    "not found";

  console.log("\n─── Résultat ───\n");
  console.log("partnerAddress dans le config :", partnerAddr);
  console.log("PLATFORM_WALLET_SECRET pubkey :", platformWallet.publicKey.toBase58());

  if (partnerAddr === platformWallet.publicKey.toBase58()) {
    console.log("\n✅ MATCH — La plateforme peut bien réclamer ses frais.");
  } else {
    console.log("\n❌ MISMATCH — Les frais plateforme vont vers une autre adresse !");
    console.log("   Pour corriger, tu dois recréer le config DBC avec la bonne adresse.");
  }

  // Fee split
  const creatorFee = config.creatorTradingFeePercentage ?? config.creator_trading_fee_percentage ?? "?";
  const partnerFee = config.partnerTradingFeePercentage ?? config.partner_trading_fee_percentage ?? "?";
  console.log("\n─── Fee split ───\n");
  console.log("Creator fee % :", creatorFee);
  console.log("Partner fee % :", partnerFee);
}

main().catch(console.error);
