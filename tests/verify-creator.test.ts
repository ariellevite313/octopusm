import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { judgeArcCreator, judgeSolanaCreator, verifyTokenCreator } from "@/lib/launch/verify-creator";
import { buildSignMessage, verifyWalletSignature } from "@/lib/launch/wallet-signature";

const CREATOR = "0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa";
const TOKEN   = "0xBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbb";
const ZERO    = "0x0000000000000000000000000000000000000000";

describe("judgeArcCreator", () => {
  const claim = { tokenAddress: TOKEN, creatorWallet: CREATOR };
  it("ok quand token et créateur correspondent (casse ignorée)", () => {
    expect(judgeArcCreator({ token: TOKEN.toLowerCase(), curve: "0x1", creator: CREATOR.toLowerCase() }, claim)).toBe("ok");
  });
  it("mismatch si le créateur est un autre wallet", () => {
    expect(judgeArcCreator({ token: TOKEN, curve: "0x1", creator: "0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc" }, claim)).toBe("mismatch");
  });
  it("mismatch si le token de la courbe n'est pas celui déclaré", () => {
    expect(judgeArcCreator({ token: "0xDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDd", curve: "0x1", creator: CREATOR }, claim)).toBe("mismatch");
  });
  it("mismatch si l'adresse n'est pas une courbe de la factory (token nul)", () => {
    expect(judgeArcCreator({ token: ZERO, curve: ZERO, creator: ZERO }, claim)).toBe("mismatch");
  });
  it("unverified si la chaîne n'a pas répondu", () => {
    expect(judgeArcCreator(null, claim)).toBe("unverified");
  });
});

describe("judgeSolanaCreator", () => {
  const claim = { mintAddress: "MintOm", creatorWallet: "Creator1" };
  it("ok / mismatch / unverified", () => {
    expect(judgeSolanaCreator({ creator: "Creator1", baseMint: "MintOm" }, claim)).toBe("ok");
    expect(judgeSolanaCreator({ creator: "Other", baseMint: "MintOm" }, claim)).toBe("mismatch");
    expect(judgeSolanaCreator({ creator: "Creator1", baseMint: "OtherMint" }, claim)).toBe("mismatch");
    expect(judgeSolanaCreator(null, claim)).toBe("unverified");
  });
});

describe("verifyTokenCreator", () => {
  it("Arc : lit la factory via le lecteur injecté", async () => {
    const readArcRecord = async () => ({ token: TOKEN, curve: "0x1", creator: CREATOR });
    expect(await verifyTokenCreator({ chain: "arc", mint_address: TOKEN, arc_launch_id: "0x1", creator_wallet: CREATOR }, { readArcRecord })).toBe("ok");
    expect(await verifyTokenCreator({ chain: "arc", mint_address: TOKEN, arc_launch_id: "0x1", creator_wallet: "0xEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEe" }, { readArcRecord })).toBe("mismatch");
  });
  it("Arc : sans arc_launch_id, on ne peut pas vérifier", async () => {
    expect(await verifyTokenCreator({ chain: "arc", mint_address: TOKEN, creator_wallet: CREATOR })).toBe("unverified");
  });
  it("Solana : lit la pool via le lecteur injecté", async () => {
    const readSolanaPool = async () => ({ creator: "Creator1", baseMint: "MintOm" });
    expect(await verifyTokenCreator({ chain: "solana", mint_address: "MintOm", pool_address: "Pool1", creator_wallet: "Creator1" }, { readSolanaPool })).toBe("ok");
    expect(await verifyTokenCreator({ chain: "solana", mint_address: "MintOm", pool_address: "Pool1", creator_wallet: "Thief" }, { readSolanaPool })).toBe("mismatch");
  });
  it("Solana : sans adresse de pool on reste non vérifié", async () => {
    expect(await verifyTokenCreator({ chain: "solana", mint_address: "MintOm", creator_wallet: "Creator1" })).toBe("unverified");
  });
});

describe("verifyWalletSignature", () => {
  const now = 1_800_000_000_000;
  it("Solana : signature valide acceptée, mauvais wallet refusé", async () => {
    const kp = nacl.sign.keyPair();
    const wallet = bs58.encode(kp.publicKey);
    const base = { action: "hackathon-apply", targetId: "tok-1", wallet, issuedAt: now };
    const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(buildSignMessage(base)), kp.secretKey));
    expect(await verifyWalletSignature({ chain: "solana", ...base, signature: sig, now })).toEqual({ ok: true });
    const other = bs58.encode(nacl.sign.keyPair().publicKey);
    const r = await verifyWalletSignature({ chain: "solana", ...base, wallet: other, signature: sig, now });
    expect(r.ok).toBe(false);
  });
  it("refuse une action différente (rejeu) et une signature expirée", async () => {
    const kp = nacl.sign.keyPair();
    const wallet = bs58.encode(kp.publicKey);
    const base = { action: "hackathon-apply", targetId: "tok-1", wallet, issuedAt: now };
    const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(buildSignMessage(base)), kp.secretKey));
    expect((await verifyWalletSignature({ chain: "solana", ...base, action: "edit", signature: sig, now })).ok).toBe(false);
    expect(await verifyWalletSignature({ chain: "solana", ...base, signature: sig, now: now + 11 * 60 * 1000 })).toEqual({ ok: false, reason: "expired" });
  });
  it("EVM : signature personal_sign valide", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const base = { action: "hackathon-apply", targetId: "tok-2", wallet: account.address, issuedAt: now };
    const signature = await account.signMessage({ message: buildSignMessage(base) });
    expect(await verifyWalletSignature({ chain: "evm", ...base, signature, now })).toEqual({ ok: true });
    expect((await verifyWalletSignature({ chain: "evm", ...base, targetId: "tok-3", signature, now })).ok).toBe(false);
  });
});
