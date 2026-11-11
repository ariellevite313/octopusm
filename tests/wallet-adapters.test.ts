/**
 * Wallets Solana : détection (injectés + Wallet Standard), format des réponses ramené à celui de Phantom,
 * et liens pour ouvrir le site dans l'app du wallet sur mobile.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import bs58 from "bs58";

// Fenêtre minimale (le module lit window au chargement)
const target = new EventTarget();
const fakeWindow: Record<string, unknown> = {
  addEventListener: target.addEventListener.bind(target),
  removeEventListener: target.removeEventListener.bind(target),
  dispatchEvent: target.dispatchEvent.bind(target),
  location: { origin: "https://omdot.fun" },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = fakeWindow;

type Adapters = typeof import("@/lib/wallet/adapters");
let A: Adapters;
beforeAll(async () => { A = await import("@/lib/wallet/adapters"); });
beforeEach(() => {
  for (const k of ["solana", "phantom", "solflare", "backpack", "trustwallet", "robinhood"]) delete fakeWindow[k];
});

const SIG = new Uint8Array(64).map((_, i) => i + 1);
const SIG58 = bs58.encode(SIG);

describe("normalizeSolanaProvider", () => {
  it("turns a bare string signature (Backpack style) into { signature }", async () => {
    const p = A.normalizeSolanaProvider({ connect: async () => ({}), signAndSendTransaction: async () => "abc123" as never });
    expect(await p.signAndSendTransaction!({})).toEqual({ signature: "abc123" });
  });

  it("encodes byte signatures to base58", async () => {
    const p = A.normalizeSolanaProvider({ connect: async () => ({}), signAndSendTransaction: async () => ({ signature: SIG }) as never });
    expect(await p.signAndSendTransaction!({})).toEqual({ signature: SIG58 });
  });

  it("returns { signature: bytes } whether signMessage gives bytes or an object", async () => {
    const raw = A.normalizeSolanaProvider({ connect: async () => ({}), signMessage: async () => SIG as never });
    expect((await raw.signMessage!(new Uint8Array([1]))).signature).toEqual(SIG);
    const obj = A.normalizeSolanaProvider({ connect: async () => ({}), signMessage: async () => ({ signature: SIG }) });
    expect((await obj.signMessage!(new Uint8Array([1]), "utf8")).signature).toEqual(SIG);
  });

  it("retries signMessage without the display argument when a wallet refuses it (Trust)", async () => {
    const calls: number[] = [];
    const p = A.normalizeSolanaProvider({
      connect: async () => ({}),
      signMessage: async (...a: unknown[]) => { calls.push(a.length); if (a.length > 1) throw new Error("bad arg"); return SIG as never; },
    });
    expect((await p.signMessage!(new Uint8Array([1]), "utf8")).signature).toEqual(SIG);
    expect(calls).toEqual([2, 1]);
  });

  it("keeps the public key returned by connect when the wallet does not expose it", async () => {
    const p = A.normalizeSolanaProvider({ connect: async () => ({ publicKey: { toString: () => "Addr111" } }) });
    expect(p.publicKey).toBeUndefined();
    await p.connect();
    expect(p.publicKey?.toString()).toBe("Addr111");
  });

  it("calls the wallet's own methods with the wallet as `this`", async () => {
    const wallet = { tag: "x", connect: async () => ({}), disconnect: async function (this: { tag: string }) { return this.tag; } };
    const p = A.normalizeSolanaProvider(wallet as never);
    expect(await (p.disconnect as unknown as () => Promise<string>)()).toBe("x");
  });
});

describe("detection", () => {
  it("finds Trust Wallet through its injected providers", () => {
    fakeWindow.trustwallet = { solana: { connect: async () => ({}) } };
    expect(A.getProviderByType("trustwallet")).not.toBeNull();
    delete fakeWindow.trustwallet;
    fakeWindow.solana = { isTrust: true, connect: async () => ({}) };
    expect(A.getProviderByType("trustwallet")).not.toBeNull();
    expect(A.getProviderByType("phantom")).toBeNull();
  });

  it("finds Backpack on window.backpack and Solflare on window.solflare", () => {
    fakeWindow.backpack = { connect: async () => ({}) };
    fakeWindow.solflare = { connect: async () => ({}) };
    expect(A.getProviderByType("backpack")).not.toBeNull();
    expect(A.getProviderByType("solflare")).not.toBeNull();
  });

  it("uses Wallet Standard when a wallet only registers there (Robinhood)", async () => {
    const account = { address: "Robin111", publicKey: new Uint8Array(32), chains: ["solana:mainnet"] };
    const wallet = {
      name: "Robinhood Wallet",
      chains: ["solana:mainnet"],
      accounts: [] as typeof account[],
      features: {
        "standard:connect": { connect: async () => ({ accounts: [account] }) },
        "solana:signMessage": { signMessage: async () => [{ signature: SIG }] },
        "solana:signAndSendTransaction": { signAndSendTransaction: async (i: { transaction: Uint8Array }) => { expect(i.transaction).toBeInstanceOf(Uint8Array); return [{ signature: SIG }]; } },
      },
    };
    fakeWindow.dispatchEvent = target.dispatchEvent.bind(target);
    target.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: ({ register }: { register: (w: unknown) => void }) => register(wallet) }));

    const p = A.getProviderByType("robinhood");
    expect(p).not.toBeNull();
    await p!.connect();
    expect(p!.publicKey?.toString()).toBe("Robin111");
    expect((await p!.signMessage!(new Uint8Array([1]))).signature).toEqual(SIG);
    const fakeTx = { serialize: () => new Uint8Array([9, 9]) };
    expect(await p!.signAndSendTransaction!(fakeTx)).toEqual({ signature: SIG58 });
    // Le nom d'un autre wallet ne doit pas être pris pour celui-ci
    expect(A.getProviderByType("trustwallet")).toBeNull();
  });
});

describe("mobile links", () => {
  const link = (t: string) => A.getAvailableWallets().find((w) => w.type === t)!.mobileDeepLink;
  const url = "https://omdot.fun/mobile-connect?wallet=x";
  it("use each wallet's documented browse format", () => {
    expect(link("phantom")!(url)).toBe(`https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent("https://omdot.fun")}`);
    expect(link("solflare")!(url)).toBe(`https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent("https://omdot.fun")}`);
    expect(link("backpack")!(url)).toBe(`https://backpack.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent("https://omdot.fun")}`);
    expect(link("trustwallet")!(url)).toBe(`https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(url)}`);
  });
  it("has no invented link for Robinhood", () => {
    expect(link("robinhood")).toBeNull();
  });
});
