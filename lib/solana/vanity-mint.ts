import { generateKeyPairSync } from "crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export const MINT_SUFFIX = "om";

/**
 * Génère à la volée une adresse de mint qui se termine par « om »
 * (~3 400 essais, ~0,3 s en moyenne). Travail découpé en petits lots pour
 * ne pas figer le serveur. Lance une erreur si rien n'est trouvé avant la limite.
 */
export async function generateOmKeypair(maxMs = 30_000, suffix = MINT_SUFFIX): Promise<Keypair> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    for (let i = 0; i < 300; i++) {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      const pub = publicKey.export({ format: "der", type: "spki" }).subarray(12);
      if (!bs58.encode(pub).endsWith(suffix)) continue;
      const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(16);
      const kp = Keypair.fromSeed(Uint8Array.from(seed));
      // Garde-fou : la clé reconstruite doit bien donner cette adresse
      if (kp.publicKey.toBase58().endsWith(suffix)) return kp;
    }
    await new Promise((r) => setImmediate(r)); // laisse respirer le serveur
  }
  throw new Error(`Mint address ending in "${suffix}" not found in time`);
}
