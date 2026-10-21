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
  it("accepts a valid signature once, then refuses a replay", () => {
    const { wallet, sign } = setup();
    const ts = Date.now();
    const sig = sign(postMessage(wallet, ts, "hello $CLT", []));
    expect(verifyPostSignature(wallet, ts, "hello $CLT", [], sig)).toBeNull();
    expect(verifyPostSignature(wallet, ts, "hello $CLT", [], sig)).toMatch(/already used/);
  });

  it("refuses a signature made for another text", () => {
    const { wallet, sign } = setup();
    const ts = Date.now();
    const sig = sign(postMessage(wallet, ts, "original", []));
    expect(verifyPostSignature(wallet, ts, "changed", [], sig)).toMatch(/does not match/);
  });

  it("refuses a signature from another wallet", () => {
    const a = setup(), b = setup();
    const ts = Date.now();
    const sig = b.sign(postMessage(a.wallet, ts, "x", []));
    expect(verifyPostSignature(a.wallet, ts, "x", [], sig)).toMatch(/does not match/);
  });

  it("refuses an old timestamp", () => {
    const { wallet, sign } = setup();
    const ts = Date.now() - 10 * 60_000;
    const sig = sign(postMessage(wallet, ts, "x", []));
    expect(verifyPostSignature(wallet, ts, "x", [], sig)).toMatch(/timestamp/);
  });

  it("binds the images to the signature", () => {
    const { wallet, sign } = setup();
    const ts = Date.now();
    const img = { mime: "image/png", data: Buffer.from("abc").toString("base64") };
    const sig = sign(postMessage(wallet, ts, "x", [img]));
    const other = { mime: "image/png", data: Buffer.from("zzz").toString("base64") };
    expect(verifyPostSignature(wallet, ts, "x", [other], sig)).toMatch(/does not match/);
  });
});
