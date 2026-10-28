import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { claimVanityKeypair } from "@/lib/solana/vanity-pool";

function grind(): Keypair { for (;;) { const k = Keypair.generate(); if (k.publicKey.toBase58().endsWith("om")) return k; } }
const rpcMock = (res: { data: unknown; error: unknown } | Error) =>
  ({ rpc: async () => { if (res instanceof Error) throw res; return res; } }) as never;

describe("claimVanityKeypair", () => {
  it("retourne la clé du stock quand elle finit par om", async () => {
    const k = grind();
    const out = await claimVanityKeypair(rpcMock({ data: [{ pub_key: k.publicKey.toBase58(), sec_key: bs58.encode(k.secretKey) }], error: null }), "t1");
    expect(out?.publicKey.toBase58()).toBe(k.publicKey.toBase58());
  });
  it("null si stock vide, erreur ou exception (le lancement continue)", async () => {
    expect(await claimVanityKeypair(rpcMock({ data: [], error: null }), "t")).toBeNull();
    expect(await claimVanityKeypair(rpcMock({ data: null, error: { message: "x" } }), "t")).toBeNull();
    expect(await claimVanityKeypair(rpcMock(new Error("boom")), "t")).toBeNull();
  });
  it("refuse une clé qui ne correspond pas à l'adresse ou ne finit pas par om", async () => {
    const k = grind(), other = Keypair.generate();
    expect(await claimVanityKeypair(rpcMock({ data: [{ pub_key: k.publicKey.toBase58(), sec_key: bs58.encode(other.secretKey) }], error: null }), "t")).toBeNull();
    let plain = Keypair.generate(); while (plain.publicKey.toBase58().endsWith("om")) plain = Keypair.generate();
    expect(await claimVanityKeypair(rpcMock({ data: [{ pub_key: plain.publicKey.toBase58(), sec_key: bs58.encode(plain.secretKey) }], error: null }), "t")).toBeNull();
  });
});
