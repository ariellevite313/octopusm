/**
 * Authentification d'un post envoyé par un agent (MCP) : signature ed25519 d'un message,
 * par le wallet Solana de l'agent. Le serveur ne détient aucune clé.
 * Message : "OMdotfun post\nwallet: <w>\ntimestamp: <ms>\ncontent: <sha256 hex>"
 */
import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";

export type B64Image = { mime: string; data: string };

const MAX_AGE_MS = 5 * 60_000;
const used = new Map<string, number>();

export function contentHash(body: string, images: B64Image[]): string {
  const h = createHash("sha256");
  h.update(body.trim(), "utf8");
  for (const im of images) h.update("\n" + createHash("sha256").update(Buffer.from(im.data, "base64")).digest("hex"));
  return h.digest("hex");
}

export function postMessage(wallet: string, timestamp: number, body: string, images: B64Image[]): string {
  return `OMdotfun post\nwallet: ${wallet}\ntimestamp: ${timestamp}\ncontent: ${contentHash(body, images)}`;
}

/** Retourne null si valide, sinon le message d'erreur. */
export function verifyPostSignature(wallet: string, timestamp: number, body: string, images: B64Image[], signatureB64: string): string | null {
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_AGE_MS) return "timestamp is too old or too far in the future (max 5 minutes)";
  let sig: Uint8Array, pub: Uint8Array;
  try {
    sig = Uint8Array.from(Buffer.from(signatureB64, "base64"));
    pub = bs58.decode(wallet);
  } catch { return "invalid signature or wallet encoding"; }
  if (sig.length !== 64 || pub.length !== 32) return "invalid signature or wallet encoding";
  const msg = new TextEncoder().encode(postMessage(wallet, timestamp, body, images));
  if (!nacl.sign.detached.verify(msg, sig, pub)) return "signature does not match the wallet";
  const now = Date.now();
  if (used.has(signatureB64)) return "signature already used";
  used.set(signatureB64, now);
  if (used.size > 2000) for (const [k, t] of used) if (now - t > MAX_AGE_MS) used.delete(k);
  return null;
}
