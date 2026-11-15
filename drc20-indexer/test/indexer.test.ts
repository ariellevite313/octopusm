import { describe, expect, it } from "vitest";
import { addressOf, base58check, parseBlock } from "../src/chain.js";
import { inscriptionsOf, type Partial } from "../src/doginals.js";
import { formatAmount, parseAmount, readOp } from "../src/drc20.js";
import { processBlock, RecentOutputs } from "../src/engine.js";
import { MemoryStore } from "../src/memory-store.js";
import { coinbase, inscribeScript, opReturn, p2pkh, rawBlock, rawTx, txidOf } from "./helpers.js";

const A = addressOf(p2pkh(1))!, B = addressOf(p2pkh(2))!;
const J = (o: object) => JSON.stringify(o);
const FUND = "ab".repeat(32);

/** Révélation : dépense une sortie et envoie l'inscription (sortie 0) à `to`. */
const reveal = (body: object, to: number, from = { txid: FUND, vout: 0 }) =>
  rawTx([{ ...from, script: inscribeScript("text/plain;charset=utf-8", J(body)) }], [{ value: 100000n, script: p2pkh(to) }]);

async function run(blocks: Buffer[][], store = new MemoryStore()) {
  const ctx = { partials: new Map<string, Partial>(), recent: new RecentOutputs() };
  let h = 4_700_000;
  for (const txs of blocks) await processBlock(parseBlock(rawBlock([coinbase(), ...txs], true)), h++, store, ctx);
  return store;
}

describe("chaîne", () => {
  it("adresses Dogecoin (D… pour P2PKH)", () => {
    expect(A.startsWith("D")).toBe(true);
    expect(base58check(0x16, Buffer.alloc(20, 1)).match(/^[9A]/)).toBeTruthy();
  });
  it("lit un bloc avec en-tête AuxPoW", () => {
    const t = reveal({ p: "drc-20", op: "deploy", tick: "dogi", max: "1000" }, 1);
    const b = parseBlock(rawBlock([coinbase(), t], true));
    expect(b.txs.length).toBe(2);
    expect(b.txs[0].coinbase).toBe(true);
    expect(b.txs[1].txid).toBe(txidOf(t));
  });
});

describe("Doginals", () => {
  it("assemble une inscription en plusieurs morceaux", () => {
    const tx = parseBlock(rawBlock([coinbase(), rawTx([{ txid: FUND, vout: 0, script: inscribeScript("text/plain", "hello doginals world", 3) }], [{ value: 1n, script: p2pkh(1) }])])).txs[1];
    const ins = inscriptionsOf(tx, new Map());
    expect(ins[0].body.toString()).toBe("hello doginals world");
    expect(ins[0].id).toBe(`${tx.txid}i0`);
  });
  it("ignore ce qui n'est pas du DRC-20", () => {
    expect(readOp("image/png", Buffer.from("x"))).toBeNull();
    expect(readOp("text/plain", Buffer.from(J({ p: "brc-20", op: "mint", tick: "dogi", amt: "1" })))).toBeNull();
    expect(readOp("text/plain", Buffer.from(J({ p: "drc-20", op: "mint", tick: "dogecoin", amt: "1" })))).toBeNull();
    expect(readOp("text/plain", Buffer.from(J({ p: "DRC-20", op: "mint", tick: "DOGI", amt: "1" })))?.tick).toBe("dogi");
  });
  it("montants : décimales, zéro et signes refusés", () => {
    expect(parseAmount("1.5", 8)).toBe(150000000n);
    expect(parseAmount("1.123456789", 8)).toBeNull();
    expect(parseAmount("0", 8)).toBeNull();
    expect(parseAmount("-1", 8)).toBeNull();
    expect(formatAmount(150000000n, 8)).toBe("1.5");
  });
});

describe("règles DRC-20", () => {
  const deploy = { p: "drc-20", op: "deploy", tick: "dogi", max: "1000", lim: "100", dec: "0" };
  const mint = (amt: string) => ({ p: "drc-20", op: "mint", tick: "dogi", amt });

  it("deploy puis mint, plafonné par lim et par max", async () => {
    const s = await run([[reveal(deploy, 1)], [reveal(mint("100"), 1), reveal(mint("101"), 1)]]);
    expect((await s.token("dogi"))?.minted).toBe(100n);
    expect((await s.balance("dogi", A)).avail).toBe(100n);
    const mints = Array.from({ length: 12 }, () => reveal(mint("100"), 2));
    const s2 = await run([[reveal(deploy, 1)], mints]);
    expect((await s2.token("dogi"))?.minted).toBe(1000n);
    expect((await s2.balance("dogi", B)).avail).toBe(1000n);
  });

  it("un second deploy du même ticker est ignoré", async () => {
    const s = await run([[reveal(deploy, 1), reveal({ ...deploy, max: "5" }, 2)]]);
    expect((await s.token("dogi"))?.max).toBe(1000n);
    expect((await s.token("dogi"))?.deployer).toBe(A);
  });

  it("transfer en deux temps : bloqué puis envoyé au destinataire", async () => {
    const t = reveal({ p: "drc-20", op: "transfer", tick: "dogi", amt: "40" }, 1);
    const send = rawTx([{ txid: txidOf(t), vout: 0 }], [{ value: 100000n, script: p2pkh(2) }]);
    const s = await run([[reveal(deploy, 1)], [reveal(mint("100"), 1)], [t]]);
    expect(await s.balance("dogi", A)).toEqual({ avail: 60n, trans: 40n });
    await run([[send]], s);
    expect(await s.balance("dogi", A)).toEqual({ avail: 60n, trans: 0n });
    expect((await s.balance("dogi", B)).avail).toBe(40n);
  });

  it("transfer sans solde suffisant : refusé", async () => {
    const s = await run([[reveal(deploy, 1)], [reveal(mint("10"), 1)], [reveal({ p: "drc-20", op: "transfer", tick: "dogi", amt: "40" }, 1)]]);
    expect(await s.balance("dogi", A)).toEqual({ avail: 10n, trans: 0n });
    expect(s.pending.size).toBe(0);
  });

  it("inscription de transfert envoyée en frais : retour à l'expéditeur", async () => {
    const t = reveal({ p: "drc-20", op: "transfer", tick: "dogi", amt: "40" }, 1);
    // L'entrée 0 (autre sortie, 100000) passe en premier ; l'inscription (2e entrée) tombe au-delà des sorties : frais
    const other = reveal({ hi: 1 }, 3, { txid: "cd".repeat(32), vout: 0 });
    const send = rawTx([{ txid: txidOf(other), vout: 0 }, { txid: txidOf(t), vout: 0 }], [{ value: 50000n, script: p2pkh(2) }]);
    const s = await run([[reveal(deploy, 1)], [reveal(mint("100"), 1)], [t, other], [send]]);
    expect(await s.balance("dogi", A)).toEqual({ avail: 100n, trans: 0n });
    expect((await s.balance("dogi", B)).avail).toBe(0n);
  });

  it("inscription de transfert envoyée vers OP_RETURN : brûlée", async () => {
    const t = reveal({ p: "drc-20", op: "transfer", tick: "dogi", amt: "40" }, 1);
    const send = rawTx([{ txid: txidOf(t), vout: 0 }], [{ value: 100000n, script: opReturn() }]);
    const s = await run([[reveal(deploy, 1)], [reveal(mint("100"), 1)], [t], [send]]);
    expect(await s.balance("dogi", A)).toEqual({ avail: 60n, trans: 0n });
    expect(s.events.at(-1)?.kind).toBe("burn");
  });

  it("une inscription de transfert ne sert qu'une fois", async () => {
    const t = reveal({ p: "drc-20", op: "transfer", tick: "dogi", amt: "40" }, 1);
    const send1 = rawTx([{ txid: txidOf(t), vout: 0 }], [{ value: 100000n, script: p2pkh(2) }]);
    const send2 = rawTx([{ txid: txidOf(send1), vout: 0 }], [{ value: 100000n, script: p2pkh(3) }]);
    const s = await run([[reveal(deploy, 1)], [reveal(mint("100"), 1)], [t], [send1], [send2]]);
    expect((await s.balance("dogi", B)).avail).toBe(40n);
    expect((await s.balance("dogi", addressOf(p2pkh(3))!)).avail).toBe(0n);
  });
});

describe("vrais blocs Dogecoin", () => {
  it("bloc 4 700 000 : en-tête AuxPoW et hash exact", async () => {
    const { readFileSync } = await import("node:fs");
    const b = parseBlock(readFileSync(new URL("./fixtures/block-4700000.hex", import.meta.url), "utf8").trim());
    expect(b.hash).toBe("748844093ba9fd6ba002ed2d0c9857c0292f1fb4aeb949d2fa8f0d438a18387f");
    expect(b.txs.length).toBe(5);
  });
  it("bloc 4 760 020 : 994 mints DRC-20 réels lus", async () => {
    const { readFileSync } = await import("node:fs");
    const { gunzipSync } = await import("node:zlib");
    const b = parseBlock(gunzipSync(readFileSync(new URL("./fixtures/block-4760020.hex.gz", import.meta.url))).toString());
    expect(b.hash).toBe("0ed7e6d1fca7097520f75e1eb0fd8b9225e3666967eb794635438c0fc3702026");
    const s = new MemoryStore();
    await s.putToken({ tick: "fiwb", max: 10n ** 30n, lim: 10n ** 21n, dec: 18, minted: 0n, deployer: "x", inscription: "x", height: 1 });
    const st = await processBlock(b, 4760020, s, { partials: new Map(), recent: new RecentOutputs() });
    expect(st.drc20).toBe(994);
    expect((await s.balance("fiwb", "DMo8t6YABMVJUiarNa1s2yybhtovX8gGDY")).avail > 0n).toBe(true);
  });
});
