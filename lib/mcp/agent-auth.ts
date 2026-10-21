/**
 * Actions signées d'un agent (MCP) : le wallet Solana de l'agent signe un message (ed25519) qui décrit
 * l'action et ses paramètres. Le serveur ne détient aucune clé.
 * Message : "OMdotfun agent action\naction: <a>\nwallet: <w>\ntimestamp: <ms>\nparams: <sha256 hex du JSON trié>"
 */
import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";

const MAX_AGE_MS = 5 * 60_000;
const used = new Map<string, number>();

function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]));
  return v;
}

export function paramsHash(params: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(canon(params)), "utf8").digest("hex");
}

export function actionMessage(action: string, wallet: string, timestamp: number, params: Record<string, unknown>): string {
  return `OMdotfun agent action\naction: ${action}\nwallet: ${wallet}\ntimestamp: ${timestamp}\nparams: ${paramsHash(params)}`;
}

/** null si valide, sinon le message d'erreur. Chaque signature ne sert qu'une fois. */
export function verifyAction(action: string, wallet: string, timestamp: number, params: Record<string, unknown>, signatureB64: string): string | null {
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_AGE_MS) return "timestamp is too old or too far in the future (max 5 minutes)";
  let sig: Uint8Array, pub: Uint8Array;
  try {
    sig = Uint8Array.from(Buffer.from(signatureB64, "base64"));
    pub = bs58.decode(wallet);
  } catch { return "invalid signature or wallet encoding"; }
  if (sig.length !== 64 || pub.length !== 32) return "invalid signature or wallet encoding";
  if (!nacl.sign.detached.verify(new TextEncoder().encode(actionMessage(action, wallet, timestamp, params)), sig, pub)) return "signature does not match the wallet";
  const now = Date.now();
  if (used.has(signatureB64)) return "signature already used";
  used.set(signatureB64, now);
  if (used.size > 2000) for (const [k, t] of used) if (now - t > MAX_AGE_MS) used.delete(k);
  return null;
}
