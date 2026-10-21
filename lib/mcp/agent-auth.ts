/**
 * Actions signées d'un agent (MCP) : le wallet de l'agent signe un message qui décrit l'action et ses
 * paramètres. Le serveur ne détient aucune clé.
 *  - Solana : signature ed25519 en base64.
 *  - Arc / EVM (0x…) : signature personal_sign (EIP-191) en hexadécimal.
 * Message : "OMdotfun agent action\naction: <a>\nwallet: <w>\ntimestamp: <ms>\nparams: <sha256 hex du JSON trié>"
 */
import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { recoverMessageAddress } from "viem";

const MAX_AGE_MS = 5 * 60_000;
const used = new Map<string, number>();

export const isEvm = (w: string) => /^0x[0-9a-fA-F]{40}$/.test(w);
export const isSolana = (w: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w);
/** Les adresses EVM sont stockées en minuscules. */
export const normAgentWallet = (w: string) => (isEvm(w) ? w.toLowerCase() : w);

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

/** Vérifie la signature d'un message par le wallet (Solana ou EVM) + fraîcheur + usage unique. null = valide. */
export async function verifyWalletSignature(wallet: string, timestamp: number, message: string, signature: string): Promise<string | null> {
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_AGE_MS) return "timestamp is too old or too far in the future (max 5 minutes)";
  if (isEvm(wallet)) {
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return "invalid signature encoding (expected a 0x… personal_sign signature)";
    let rec: string;
    try { rec = await recoverMessageAddress({ message, signature: signature as `0x${string}` }); } catch { return "invalid signature"; }
    if (rec.toLowerCase() !== wallet.toLowerCase()) return "signature does not match the wallet";
  } else {
    let sig: Uint8Array, pub: Uint8Array;
    try {
      sig = Uint8Array.from(Buffer.from(signature, "base64"));
      pub = bs58.decode(wallet);
    } catch { return "invalid signature or wallet encoding"; }
    if (sig.length !== 64 || pub.length !== 32) return "invalid signature or wallet encoding";
    if (!nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pub)) return "signature does not match the wallet";
  }
  const now = Date.now();
  if (used.has(signature)) return "signature already used";
  used.set(signature, now);
  if (used.size > 2000) for (const [k, t] of used) if (now - t > MAX_AGE_MS) used.delete(k);
  return null;
}

export function verifyAction(action: string, wallet: string, timestamp: number, params: Record<string, unknown>, signature: string): Promise<string | null> {
  return verifyWalletSignature(wallet, timestamp, actionMessage(action, wallet, timestamp, params), signature);
}
