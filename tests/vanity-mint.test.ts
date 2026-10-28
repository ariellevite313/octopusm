import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import { generateOmKeypair } from "@/lib/solana/vanity-mint";

describe("generateOmKeypair", () => {
  it("donne des adresses qui se terminent par om, avec une clé valide", async () => {
    for (let i = 0; i < 5; i++) {
      const kp = await generateOmKeypair();
      expect(kp.publicKey.toBase58().endsWith("om")).toBe(true);
      expect(Keypair.fromSecretKey(kp.secretKey).publicKey.equals(kp.publicKey)).toBe(true);
    }
  });
  it("erreur claire si la limite de temps est dépassée", async () => {
    await expect(generateOmKeypair(50, "zzzzzzzz")).rejects.toThrow();
  });
});
