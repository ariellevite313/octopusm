/**
 * Preuve de contrôle d'un wallet par signature de message (Solana ed25519, EVM personal_sign).
 * Sert aux actions qui engagent un projet (candidature au hackathon, modification).
 * Le message contient l'action, l'identifiant ciblé, le wallet et une date : il ne peut pas
 * être rejoué pour une autre action ni après expiration.
 */
import nacl from "tweetnacl";
import bs58 from "bs58";

export const SIGNATURE_MAX_AGE_MS = 10 * 60 * 1000;

export function buildSignMessage(p: { action: string; targetId: string; wallet: string; issuedAt: number }): string {
  return `OMdotfun\nAction: ${p.action}\nTarget: ${p.targetId}\nWallet: ${p.wallet}\nIssued: ${p.issuedAt}`;
}

export type SignatureCheck = { ok: true } | { ok: false; reason: "expired" | "bad_message" | "bad_signature" };

export async function verifyWalletSignature(p: {
  chain: "solana" | "evm";
  action: string;
  targetId: string;
  wallet: string;
  issuedAt: number;
  signature: string;
  now?: number;
}): Promise<SignatureCheck> {
  const now = p.now ?? Date.now();
  if (!Number.isFinite(p.issuedAt) || now - p.issuedAt > SIGNATURE_MAX_AGE_MS || p.issuedAt - now > 60_000) {
    return { ok: false, reason: "expired" };
  }
  const message = buildSignMessage(p);
  try {
    if (p.chain === "solana") {
      const sig = bs58.decode(p.signature);
      const pub = bs58.decode(p.wallet);
      if (pub.length !== 32 || sig.length !== 64) return { ok: false, reason: "bad_message" };
      const ok = nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pub);
      return ok ? { ok: true } : { ok: false, reason: "bad_signature" };
    }
    const { verifyMessage } = await import("viem");
    const ok = await verifyMessage({
      address: p.wallet as `0x${string}`,
      message,
      signature: p.signature as `0x${string}`,
    });
    return ok ? { ok: true } : { ok: false, reason: "bad_signature" };
  } catch {
    return { ok: false, reason: "bad_message" };
  }
}
