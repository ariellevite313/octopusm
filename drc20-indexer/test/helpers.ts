/** Fabrication de transactions et blocs Dogecoin bruts pour les tests. */
import { sha256d } from "../src/chain.js";

const varint = (n: number) => (n < 0xfd ? Buffer.from([n]) : Buffer.from([0xfd, n & 0xff, n >> 8]));
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const u64 = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };
export const push = (d: Buffer | string | number) => {
  if (typeof d === "number") return d === 0 ? Buffer.from([0]) : d <= 16 ? Buffer.from([0x50 + d]) : Buffer.from([1, d]);
  const b = typeof d === "string" ? Buffer.from(d) : d;
  return b.length <= 75 ? Buffer.concat([Buffer.from([b.length]), b]) : Buffer.concat([Buffer.from([0x4d, b.length & 0xff, b.length >> 8]), b]);
};
export const p2pkh = (n: number) => Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), Buffer.alloc(20, n), Buffer.from([0x88, 0xac])]);
export const opReturn = () => Buffer.from([0x6a, 0x01, 0x00]);

export type TIn = { txid: string; vout: number; script?: Buffer };
export type TOut = { value: bigint; script: Buffer };

export function rawTx(vin: TIn[], vout: TOut[]): Buffer {
  return Buffer.concat([
    u32(1), varint(vin.length),
    ...vin.flatMap((i) => [Buffer.from(i.txid, "hex").reverse(), u32(i.vout), varint((i.script ?? Buffer.alloc(0)).length), i.script ?? Buffer.alloc(0), u32(0xffffffff)]),
    varint(vout.length), ...vout.flatMap((o) => [u64(o.value), varint(o.script.length), o.script]), u32(0),
  ]);
}
export const txidOf = (raw: Buffer) => Buffer.from(sha256d(raw)).reverse().toString("hex");

export function coinbase(): Buffer { return rawTx([{ txid: "0".repeat(64), vout: 0xffffffff, script: Buffer.from([1, 1]) }], [{ value: 10000n, script: p2pkh(99) }]); }

/** Bloc brut ; auxpow=true ajoute un en-tête AuxPoW (minage fusionné) comme sur le vrai réseau. */
export function rawBlock(txs: Buffer[], auxpow = false): string {
  const version = auxpow ? 0x00620104 : 0x00000004;
  const header = Buffer.concat([u32(version), Buffer.alloc(32, 1), Buffer.alloc(32, 2), u32(1700000000), u32(0x1d00ffff), u32(0)]);
  const aux = auxpow ? Buffer.concat([coinbase(), Buffer.alloc(32, 3), varint(1), Buffer.alloc(32, 4), u32(0), varint(0), u32(0), Buffer.alloc(80, 5)]) : Buffer.alloc(0);
  return Buffer.concat([header, aux, varint(txs.length), ...txs]).toString("hex");
}

/** scriptSig d'une révélation Doginals : "ord" <n> <type> <n-1> <data> … puis signature + script de rachat factices. */
export function inscribeScript(contentType: string, body: string, pieces = 1): Buffer {
  const b = Buffer.from(body);
  const size = Math.ceil(b.length / pieces);
  const parts: Buffer[] = [push("ord"), push(pieces), push(contentType)];
  for (let i = 0; i < pieces; i++) parts.push(push(pieces - 1 - i), push(b.subarray(i * size, (i + 1) * size)));
  parts.push(push(Buffer.alloc(71, 7)), push(Buffer.alloc(40, 8)));
  return Buffer.concat(parts);
}
