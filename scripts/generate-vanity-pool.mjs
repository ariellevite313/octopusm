#!/usr/bin/env node
/**
 * Pre-generate vanity Solana keypairs and insert them into the DB pool.
 *
 * Usage (run from project root):
 *   node scripts/generate-vanity-pool.mjs
 *   node scripts/generate-vanity-pool.mjs --count 200 --suffix OCTO
 *
 * Reads credentials from .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Install deps if missing:
 *   npm install @solana/web3.js bs58 @supabase/supabase-js
 */

import { Keypair }    from "@solana/web3.js";
import bs58           from "bs58";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// Node 20 doesn't have native WebSocket — provide ws as polyfill
const ws = (() => { try { return require("ws"); } catch { return undefined; } })();
import { readFileSync, existsSync } from "fs";
import { resolve, dirname }        from "path";
import { fileURLToPath }           from "url";

// ── Args ──────────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : def;
};

const COUNT  = parseInt(getArg("--count",  "100"), 10);
const SUFFIX = getArg("--suffix", "OCTO").toUpperCase();
const BATCH  = 10; // insert every N keypairs

// ── Load .env.local ───────────────────────────────────────────────────────────
const root    = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env.local");

if (!existsSync(envFile)) {
  console.error("❌  .env.local not found at", envFile);
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .filter(l => l.trim() && !l.startsWith("#") && l.includes("="))
    .map(l => {
      const eq = l.indexOf("=");
      return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  ...(ws ? { global: { WebSocket: ws } } : {}),
});

// ── Check existing pool ───────────────────────────────────────────────────────
const { count: existing } = await supabase
  .from("vanity_keypair_pool")
  .select("id", { count: "exact", head: true })
  .is("assigned_token_id", null);

console.log(`\n🔑  Generating ${COUNT} keypairs with suffix "${SUFFIX}"`);
console.log(`    Pool currently has ${existing ?? 0} available keypairs\n`);

// ── Generate loop ─────────────────────────────────────────────────────────────
let found = 0;
let attempts = 0;
const batch = [];
const startMs = Date.now();

// Warn threshold: a 4-char base58 suffix has ~1/58^4 ≈ 1/11M probability.
// Beyond 100M attempts without a match, the suffix is likely invalid.
const MAX_ATTEMPTS_PER_KEY = 100_000_000;
let attemptsForCurrentKey  = 0;

while (found < COUNT) {
  const kp   = Keypair.generate();
  const addr = kp.publicKey.toBase58();
  attempts++;
  attemptsForCurrentKey++;

  if (attemptsForCurrentKey > MAX_ATTEMPTS_PER_KEY) {
    console.error(
      `\n❌  Exceeded ${MAX_ATTEMPTS_PER_KEY.toLocaleString()} attempts looking for suffix "${SUFFIX}".` +
      `\n    Check the suffix is valid base58 and not too long.`
    );
    process.exit(1);
  }

  if (addr.toUpperCase().endsWith(SUFFIX)) {
    attemptsForCurrentKey = 0; // reset for next keypair
    batch.push({
      public_key: addr,
      secret_key: bs58.encode(kp.secretKey),
      suffix:     SUFFIX,
    });
    found++;

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    const rate    = (attempts / ((Date.now() - startMs) / 1000)).toFixed(0);
    process.stdout.write(
      `\r  [${found}/${COUNT}]  ${addr}  (${elapsed}s · ${Number(rate).toLocaleString()} keys/s)`
    );

    // Flush batch
    if (batch.length >= BATCH || found === COUNT) {
      const { error } = await supabase.from("vanity_keypair_pool").insert(batch);
      if (error) {
        // Skip duplicates (unique constraint on public_key), fail on others
        if (!error.message.includes("duplicate")) {
          console.error("\n❌  Insert error:", error.message);
          process.exit(1);
        }
      }
      batch.length = 0;
    }
  }
}

const totalSec = ((Date.now() - startMs) / 1000).toFixed(1);
console.log(`\n\n✅  Done! ${COUNT} keypairs inserted in ${totalSec}s`);
console.log(`    Average: ${Math.round(attempts / COUNT).toLocaleString()} attempts per keypair`);
console.log(`    Pool now has ${(existing ?? 0) + COUNT} available keypairs\n`);
