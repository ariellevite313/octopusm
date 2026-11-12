/**
 * Clés des wallets d'IA : générées sur le serveur, chiffrées en AES-256-GCM avec la clé maître AGENT_WALLET_KEY
 * (32 octets en hex ou en base64, uniquement dans le .env du serveur). Format stocké : v1.<iv>.<tag>.<données> en base64url.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export class AgentKeyError extends Error {}

function masterKey(): Buffer {
  const raw = process.env.AGENT_WALLET_KEY?.trim();
  if (!raw) throw new AgentKeyError("AI wallets are not configured on this server");
  const k = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (k.length !== 32) throw new AgentKeyError("AGENT_WALLET_KEY must be 32 bytes (64 hex characters)");
  return k;
}

export function encryptSecret(plain: Uint8Array, key: Buffer = masterKey()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(plain), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(stored: string, key: Buffer = masterKey()): Buffer {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new AgentKeyError("Unreadable wallet key");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]);
}

/** Nouveau couple de wallets (Solana + EVM pour Arc), clés déjà chiffrées. */
export function newWallets(key?: Buffer) {
  const k = key ?? masterKey();
  const sol = Keypair.generate();
  const pk = generatePrivateKey();
  const evm = privateKeyToAccount(pk);
  return {
    sol_address: sol.publicKey.toBase58(),
    sol_secret: encryptSecret(sol.secretKey, k),
    evm_address: evm.address.toLowerCase(),
    evm_secret: encryptSecret(Buffer.from(pk.slice(2), "hex"), k),
  };
}

export const solKeypair = (stored: string, key?: Buffer) => Keypair.fromSecretKey(decryptSecret(stored, key));
export const evmAccount = (stored: string, key?: Buffer) => privateKeyToAccount(`0x${decryptSecret(stored, key).toString("hex")}`);
