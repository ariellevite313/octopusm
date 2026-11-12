import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, evmAccount, newWallets, solKeypair } from "@/lib/agent-wallet/keys";
import { parseLimits } from "@/lib/agent-wallet/limits";
import { aidoLinkMessage, parseAidoMessage } from "@/lib/aido-link";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const KEY = randomBytes(32);

describe("AI wallet keys", () => {
  it("encrypts and decrypts, never stores the key in clear", () => {
    const secret = randomBytes(64);
    const enc = encryptSecret(secret, KEY);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain(secret.toString("base64url"));
    expect(decryptSecret(enc, KEY).equals(secret)).toBe(true);
  });
  it("refuses a wrong master key or a tampered value", () => {
    const enc = encryptSecret(randomBytes(32), KEY);
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), KEY)).toThrow();
  });
  it("creates a Solana and an EVM wallet whose keys match their addresses", () => {
    const w = newWallets(KEY);
    expect(solKeypair(w.sol_secret, KEY).publicKey.toBase58()).toBe(w.sol_address);
    expect(evmAccount(w.evm_secret, KEY).address.toLowerCase()).toBe(w.evm_address);
    expect(w.evm_address).toMatch(/^0x[0-9a-f]{40}$/);
  });
  it("refuses to work without AGENT_WALLET_KEY", () => {
    const old = process.env.AGENT_WALLET_KEY;
    delete process.env.AGENT_WALLET_KEY;
    expect(() => newWallets()).toThrow(/not configured/);
    process.env.AGENT_WALLET_KEY = "abcd";
    expect(() => newWallets()).toThrow(/32 bytes/);
    if (old) process.env.AGENT_WALLET_KEY = old; else delete process.env.AGENT_WALLET_KEY;
  });
});

describe("AI wallet limits", () => {
  it("accepts valid limits and toggles", () => {
    expect(parseLimits({ max_action_usd: 20, max_day_usd: 100, paused: true })).toEqual({ ok: true, v: { max_action_usd: 20, max_day_usd: 100, paused: true } });
  });
  it("rejects bad values", () => {
    expect(parseLimits({ max_action_usd: -1 }).ok).toBe(false);
    expect(parseLimits({ max_day_usd: 1e9 }).ok).toBe(false);
    expect(parseLimits({ max_action_usd: 300, max_day_usd: 100 }).ok).toBe(false);
    expect(parseLimits({ allow_trade: "yes" }).ok).toBe(false);
  });
});

describe("Aido link message", () => {
  const om = "So1anaWa11etAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  it("accepts a fresh message for this account", async () => {
    const acc = privateKeyToAccount(generatePrivateKey());
    const msg = aidoLinkMessage(om, acc.address, new Date().toISOString());
    expect(parseAidoMessage(msg, om)).toEqual({ aido: acc.address.toLowerCase() });
  });
  it("rejects another account, an old message or a changed text", () => {
    const a = "0x" + "a".repeat(40);
    expect(parseAidoMessage(aidoLinkMessage(om, a, new Date().toISOString()), "Other")).toHaveProperty("error");
    expect(parseAidoMessage(aidoLinkMessage(om, a, new Date(Date.now() - 3600_000).toISOString()), om)).toHaveProperty("error");
    expect(parseAidoMessage(aidoLinkMessage(om, a, new Date().toISOString()) + "\nextra", om)).toHaveProperty("error");
  });
});
