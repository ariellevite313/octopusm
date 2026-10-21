import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { postMessage, verifyPostSignature } from "@/lib/mcp/post-auth";

function setup() {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const sign = (msg: string) => Buffer.from(nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey)).toString("base64");
  return { wallet, sign };
}

describe("MCP create_post — signature check", () => {
  it("accepts a valid signature once, then refuses a replay", async () => {
    const { wallet, sign } = setup();
    const ts = Date.now();
    const sig = sign(postMessage(wallet, ts, "hello $CLT", []));
    expect(await verifyPostSignature(wallet, ts, "hello $CLT", [], sig)).toBeNull();
    expect(await verifyPostSignature(wallet, ts, "hello $CLT", [], sig)).toMatch(/already used/);
  });

  it("refuses a signature made for another text", async () => {
    const { wallet, sign } = setup();
    const ts = Date.now();
    const sig = sign(postMessage(wallet, ts, "original", []));
    expect(await verifyPostSignature(wallet, ts, "changed", [], sig)).toMatch(/does not match/);
  });

  it("refuses a signature from another wallet", async () => {
    const a = setup(), b = setup();
    const ts = Date.now();
    const sig = b.sign(postMessage(a.wallet, ts, "x", []));
    expect(await verifyPostSignature(a.wallet, ts, "x", [], sig)).toMatch(/does not match/);
  });

  it("refuses an old timestamp", async () => {
    const { wallet, sign } = setup();
    const ts = Date.now() - 10 * 60_000;
    const sig = sign(postMessage(wallet, ts, "x", []));
    expect(await verifyPostSignature(wallet, ts, "x", [], sig)).toMatch(/timestamp/);
  });

  it("binds the images to the signature", async () => {
    const { wallet, sign } = setup();
    const ts = Date.now();
    const img = { mime: "image/png", data: Buffer.from("abc").toString("base64") };
    const sig = sign(postMessage(wallet, ts, "x", [img]));
    const other = { mime: "image/png", data: Buffer.from("zzz").toString("base64") };
    expect(await verifyPostSignature(wallet, ts, "x", [other], sig)).toMatch(/does not match/);
  });
});

import { actionMessage, verifyAction } from "@/lib/mcp/agent-auth";

describe("MCP agent_action — signature check", () => {
  it("accepts a valid signature once; params are bound regardless of key order", async () => {
    const { wallet, sign } = setup();
    const ts = Date.now();
    const sig = sign(actionMessage("reply_post", wallet, ts, { id: "a", body: "hi" }));
    expect(await verifyAction("reply_post", wallet, ts, { body: "hi", id: "a" }, sig)).toBeNull();
    expect(await verifyAction("reply_post", wallet, ts, { body: "hi", id: "a" }, sig)).toMatch(/already used/);
  });

  it("refuses other params, another action or another wallet", async () => {
    const a = setup(), b = setup();
    const ts = Date.now();
    const sig = a.sign(actionMessage("like_post", a.wallet, ts, { id: "x" }));
    expect(await verifyAction("like_post", a.wallet, ts, { id: "y" }, sig)).toMatch(/does not match/);
    expect(await verifyAction("delete_post", a.wallet, ts, { id: "x" }, sig)).toMatch(/does not match/);
    expect(await verifyAction("like_post", b.wallet, ts, { id: "x" }, sig)).toMatch(/does not match/);
  });
});

describe("MCP signed actions — Arc (EVM) wallets", () => {
  it("accepts a personal_sign signature from the 0x wallet, once", async () => {
    const acc = privateKeyToAccount(generatePrivateKey());
    const wallet = acc.address.toLowerCase();
    const ts = Date.now();
    const sig = await acc.signMessage({ message: actionMessage("follow", wallet, ts, { wallet: "x" }) });
    expect(await verifyAction("follow", wallet, ts, { wallet: "x" }, sig)).toBeNull();
    expect(await verifyAction("follow", wallet, ts, { wallet: "x" }, sig)).toMatch(/already used/);
  });

  it("refuses a signature from another EVM account or for other params", async () => {
    const a = privateKeyToAccount(generatePrivateKey()), b = privateKeyToAccount(generatePrivateKey());
    const wallet = a.address.toLowerCase();
    const ts = Date.now();
    const bad = await b.signMessage({ message: actionMessage("like_post", wallet, ts, { id: "1" }) });
    expect(await verifyAction("like_post", wallet, ts, { id: "1" }, bad)).toMatch(/does not match/);
    const ok = await a.signMessage({ message: actionMessage("like_post", wallet, ts, { id: "1" }) });
    expect(await verifyAction("like_post", wallet, ts, { id: "2" }, ok)).toMatch(/does not match/);
    expect(await verifyAction("like_post", wallet, ts, { id: "1" }, "0x1234")).toMatch(/encoding/);
  });
});
