#!/usr/bin/env node
/**
 * Ajoute à la réserve vanity_keypair_pool des clés générées avec l'outil officiel Solana (beaucoup plus rapide qu'en JavaScript).
 *
 * 1. Générer (plusieurs cœurs, quelques minutes par clé) :
 *      solana-keygen grind --starts-with DoGE:20 --ignore-case=false
 *    Cela crée des fichiers DoGE….json dans le dossier courant.
 * 2. Importer :
 *      node scripts/import-vanity-keys.mjs --label DoGE ./DoGE*.json
 *    Les fichiers peuvent ensuite être supprimés (la clé est dans la base, effacée après le lancement).
 *
 * Lit NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local.
 */
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);
const li = args.indexOf("--label");
const LABEL = li >= 0 ? args[li + 1] : "DoGE";
const files = args.filter((a, i) => a.endsWith(".json") && i !== li + 1);
if (!files.length) { console.error("Usage: node scripts/import-vanity-keys.mjs --label DoGE ./DoGE*.json"); process.exit(1); }

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env.local");
if (!existsSync(envFile)) { console.error(".env.local not found"); process.exit(1); }
const env = Object.fromEntries(readFileSync(envFile, "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const rows = [];
for (const f of files) {
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(f, "utf8"))));
  const pub = kp.publicKey.toBase58();
  if (!pub.startsWith(LABEL)) { console.warn(`skip ${f}: ${pub} does not start with ${LABEL}`); continue; }
  rows.push({ public_key: pub, secret_key: bs58.encode(kp.secretKey), suffix: LABEL });
}
if (!rows.length) { console.error("No valid key"); process.exit(1); }
const { error } = await db.from("vanity_keypair_pool").upsert(rows, { onConflict: "public_key", ignoreDuplicates: true });
if (error) { console.error(error.message); process.exit(1); }
const { count } = await db.from("vanity_keypair_pool").select("id", { count: "exact", head: true }).eq("suffix", LABEL).is("assigned_token_id", null);
console.log(`Imported ${rows.length} keys. Available "${LABEL}" keys: ${count}`);
