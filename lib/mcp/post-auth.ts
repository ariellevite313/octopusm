/**
 * Authentification d'un post envoyé par un agent (MCP) : signature ed25519 d'un message,
 * par le wallet de l'agent (Solana ou Arc). Le serveur ne détient aucune clé.
 * Message : "OMdotfun post\nwallet: <w>\ntimestamp: <ms>\ncontent: <sha256 hex>"
 * Le hash couvre le texte, chaque image base64 et chaque lien d'image (dans cet ordre).
 */
import { createHash } from "node:crypto";
import { verifyWalletSignature } from "@/lib/mcp/agent-auth";

export type B64Image = { mime: string; data: string };

export function contentHash(body: string, images: B64Image[], imageUrls: string[] = []): string {
  const h = createHash("sha256");
  h.update(body.trim(), "utf8");
  for (const im of images) h.update("\n" + createHash("sha256").update(Buffer.from(im.data, "base64")).digest("hex"));
  for (const u of imageUrls) h.update("\nurl:" + u, "utf8");
  return h.digest("hex");
}

export function postMessage(wallet: string, timestamp: number, body: string, images: B64Image[], imageUrls: string[] = []): string {
  return `OMdotfun post\nwallet: ${wallet}\ntimestamp: ${timestamp}\ncontent: ${contentHash(body, images, imageUrls)}`;
}

/** Retourne null si valide, sinon le message d'erreur. */
export function verifyPostSignature(wallet: string, timestamp: number, body: string, images: B64Image[], signature: string, imageUrls: string[] = []): Promise<string | null> {
  return verifyWalletSignature(wallet, timestamp, postMessage(wallet, timestamp, body, images, imageUrls), signature);
}
