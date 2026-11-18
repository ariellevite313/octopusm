#!/usr/bin/env node
/**
 * Crée la clé de l'indexer DRC-20 (rôle limité « drc20_indexer », voir la migration 20261129_drc20_indexer_role.sql).
 * À lancer sur TON serveur : SUPABASE_JWT_SECRET=... node scripts-make-key.mjs
 * (le « JWT Secret » se trouve dans Supabase > Project Settings > API). Mets le résultat dans SUPABASE_KEY du .env de l'indexer.
 */
import { createHmac } from "node:crypto";

const secret = process.env.SUPABASE_JWT_SECRET;
if (!secret) { console.error("SUPABASE_JWT_SECRET manquant"); process.exit(1); }
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: "HS256", typ: "JWT" });
const body = b64({ role: "drc20_indexer", iss: "supabase", iat: now, exp: now + 5 * 365 * 86400 });
const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
console.log(`${head}.${body}.${sig}`);
