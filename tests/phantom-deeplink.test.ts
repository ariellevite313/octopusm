/**
 * Signature par liens profonds (Phantom / Solflare) depuis un navigateur mobile sans wallet injecté :
 * la transaction part chiffrée vers le wallet, la réponse chiffrée du wallet donne la signature et l'enregistrement à faire.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";

const store = new Map<string, string>();
const loc = { href: "", origin: "https://omdot.fun" };
beforeAll(() => {
  const define = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  define("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  define("window", { location: loc });
  define("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile" });
});
beforeEach(() => { store.clear(); loc.href = ""; });

// Le wallet : sa paire de clés, et ce qu'il fait d'une demande de connexion
const wallet = nacl.box.keyPair();
const ADDRESS = bs58.encode(nacl.sign.keyPair().publicKey);

function walletConnects(url: string, extra: Record<string, string> = {}) {
  const q = new URL(url).searchParams;
  const dapp = bs58.decode(q.get("dapp_encryption_public_key")!);
  const nonce = nacl.randomBytes(24);
  const data = nacl.box(new TextEncoder().encode(JSON.stringify({ public_key: ADDRESS, session: "sess-1" })), nonce, dapp, wallet.secretKey);
  return new URLSearchParams({ phantom_encryption_public_key: bs58.encode(wallet.publicKey), nonce: bs58.encode(nonce), data: bs58.encode(data), ...extra });
}

describe("liens profonds : signature d'une transaction", () => {
  it("reconnexion légère puis envoi chiffré, signature rendue avec les enregistrements à faire", async () => {
    const m = await import("@/lib/wallet/phantom-deeplink");
    expect(m.canDeeplink("solflare")).toBe(true);
    expect(m.canDeeplink("backpack")).toBe(false);
    expect(m.hasSendSession("solflare", ADDRESS)).toBe(false);

    // 1) pas de session : reconnexion légère
    m.startDeeplinkSession("solflare", "/terminal?mint=abc");
    expect(loc.href.startsWith("https://solflare.com/ul/v1/connect?")).toBe(true);
    expect(new URL(loc.href).searchParams.get("redirect_link")).toBe("https://omdot.fun/phantom-callback?step=session");
    const back = m.handleSessionResponse(walletConnects(loc.href));
    expect(back).toEqual({ address: ADDRESS, wallet: "solflare", returnTo: "/terminal?mint=abc" });
    expect(m.hasSendSession("solflare", ADDRESS)).toBe(true);
    expect(m.hasSendSession("solflare", "autre")).toBe(false);

    // 2) envoi : le wallet déchiffre la transaction avec la session
    const tx = new Uint8Array([1, 2, 3, 4, 5]);
    m.startDeeplinkSend("solflare", tx, { returnTo: "/terminal?mint=abc", records: [{ url: "/api/swap/record", sigField: "signature", body: { inputMint: "A", outputMint: "B" } }] });
    const u = new URL(loc.href);
    expect(u.origin + u.pathname).toBe("https://solflare.com/ul/v1/signAndSendTransaction");
    expect(u.searchParams.get("redirect_link")).toBe("https://omdot.fun/phantom-callback?step=send");
    const plain = nacl.box.open(bs58.decode(u.searchParams.get("payload")!), bs58.decode(u.searchParams.get("nonce")!), bs58.decode(u.searchParams.get("dapp_encryption_public_key")!), wallet.secretKey);
    const sent = JSON.parse(new TextDecoder().decode(plain!));
    expect(sent.session).toBe("sess-1");
    expect(Array.from(bs58.decode(sent.transaction))).toEqual([1, 2, 3, 4, 5]);

    // 3) retour : signature chiffrée par le wallet
    const n2 = nacl.randomBytes(24);
    const reply = nacl.box(new TextEncoder().encode(JSON.stringify({ signature: "5igSig" })), n2, bs58.decode(u.searchParams.get("dapp_encryption_public_key")!), wallet.secretKey);
    const r = m.handleSendResponse(new URLSearchParams({ nonce: bs58.encode(n2), data: bs58.encode(reply) }));
    expect(r.signature).toBe("5igSig");
    expect(r.pending.returnTo).toBe("/terminal?mint=abc");
    expect(r.pending.records?.[0].url).toBe("/api/swap/record");
    // l'envoi en attente est consommé, la session reste
    expect(() => m.handleSendResponse(new URLSearchParams({ nonce: bs58.encode(n2), data: bs58.encode(reply) }))).toThrow();
    expect(m.hasSendSession("solflare", ADDRESS)).toBe(true);
  });

  it("n'accepte qu'un retour sur une page du site", async () => {
    const { safeReturn } = await import("@/lib/wallet/phantom-deeplink");
    expect(safeReturn("/terminal?mint=x")).toBe("/terminal?mint=x");
    expect(safeReturn("//evil.com")).toBe("/");
    expect(safeReturn("https://evil.com")).toBe("/");
    expect(safeReturn("/\\evil.com")).toBe("/");
    expect(safeReturn(undefined)).toBe("/");
  });

  it("une réponse chiffrée par un autre wallet est refusée", async () => {
    const m = await import("@/lib/wallet/phantom-deeplink");
    m.startDeeplinkSession("phantom", "/");
    m.handleSessionResponse(walletConnects(loc.href));
    m.startDeeplinkSend("phantom", new Uint8Array([9]), { returnTo: "/" });
    const attacker = nacl.box.keyPair();
    const n = nacl.randomBytes(24);
    const forged = nacl.box(new TextEncoder().encode(JSON.stringify({ signature: "fake" })), n, bs58.decode(new URL(loc.href).searchParams.get("dapp_encryption_public_key")!), attacker.secretKey);
    expect(() => m.handleSendResponse(new URLSearchParams({ nonce: bs58.encode(n), data: bs58.encode(forged) }))).toThrow();
  });
});
