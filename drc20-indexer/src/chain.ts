/**
 * Lecture des blocs et transactions Dogecoin au format brut (hex renvoyé par getblock <hash> false).
 * Dogecoin est un fork de Bitcoin 0.14 : pas de SegWit, mais des en-têtes AuxPoW (minage fusionné avec Litecoin)
 * à sauter après les 80 octets de l'en-tête quand le bit 8 de la version est levé.
 */
import { createHash } from "node:crypto";

export type TxIn = { prevTxid: string; prevVout: number; script: Buffer; sequence: number };
export type TxOut = { value: bigint; script: Buffer };
export type Tx = { txid: string; vin: TxIn[]; vout: TxOut[]; coinbase: boolean };
export type Block = { hash: string; prevHash: string; time: number; txs: Tx[] };

export const sha256d = (b: Buffer) => createHash("sha256").update(createHash("sha256").update(b).digest()).digest();
const rev = (b: Buffer) => Buffer.from(b).reverse().toString("hex");

export class Reader {
  o = 0;
  constructor(public b: Buffer) {}
  bytes(n: number) { if (this.o + n > this.b.length) throw new Error("read past end"); const s = this.b.subarray(this.o, this.o + n); this.o += n; return s; }
  u8() { return this.bytes(1)[0]; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  i32() { const v = this.b.readInt32LE(this.o); this.o += 4; return v; }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return v; }
  varint(): number {
    const f = this.u8();
    if (f < 0xfd) return f;
    if (f === 0xfd) { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
    if (f === 0xfe) return this.u32();
    const v = this.u64(); if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("varint too big"); return Number(v);
  }
  varbytes() { return this.bytes(this.varint()); }
}

export function readTx(r: Reader): Tx {
  const start = r.o;
  r.u32(); // version
  const vin: TxIn[] = [];
  const nIn = r.varint();
  for (let i = 0; i < nIn; i++) vin.push({ prevTxid: rev(r.bytes(32)), prevVout: r.u32(), script: Buffer.from(r.varbytes()), sequence: r.u32() });
  const vout: TxOut[] = [];
  const nOut = r.varint();
  for (let i = 0; i < nOut; i++) vout.push({ value: r.u64(), script: Buffer.from(r.varbytes()) });
  r.u32(); // locktime
  const raw = r.b.subarray(start, r.o);
  const coinbase = vin.length === 1 && /^0{64}$/.test(vin[0].prevTxid) && vin[0].prevVout === 0xffffffff;
  return { txid: rev(sha256d(raw)), vin, vout, coinbase };
}

const AUXPOW_FLAG = 1 << 8;

export function parseBlock(hex: string): Block {
  const b = Buffer.from(hex, "hex");
  const r = new Reader(b);
  const header = b.subarray(0, 80);
  const version = r.u32();
  const prevHash = rev(r.bytes(32));
  r.bytes(32); // merkle root
  const time = r.u32();
  r.u32(); r.u32(); // bits, nonce
  if (version & AUXPOW_FLAG) {
    readTx(r); // transaction coinbase du bloc parent
    r.bytes(32); // hash du bloc parent
    const n1 = r.varint(); r.bytes(32 * n1); r.i32(); // branche de Merkle de la coinbase
    const n2 = r.varint(); r.bytes(32 * n2); r.i32(); // branche de la chaîne fusionnée
    r.bytes(80); // en-tête du bloc parent
  }
  const n = r.varint();
  const txs: Tx[] = [];
  for (let i = 0; i < n; i++) txs.push(readTx(r));
  return { hash: rev(sha256d(header)), prevHash, time, txs };
}

// ── Scripts ─────────────────────────────────────────────────────────────────

/** Données poussées par un script (OP_0, OP_1..16 en petits nombres, PUSHDATA). Les autres opcodes sont ignorés. */
export function pushes(script: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let i = 0;
  while (i < script.length) {
    const op = script[i++];
    let n = -1;
    if (op === 0x00) { out.push(Buffer.alloc(0)); continue; }
    if (op >= 0x01 && op <= 0x4b) n = op;
    else if (op === 0x4c) n = script[i++];
    else if (op === 0x4d) { n = script.readUInt16LE(i); i += 2; }
    else if (op === 0x4e) { n = script.readUInt32LE(i); i += 4; }
    else if (op === 0x4f) { out.push(Buffer.from([0x81])); continue; } // OP_1NEGATE
    else if (op >= 0x51 && op <= 0x60) { out.push(Buffer.from([op - 0x50])); continue; }
    else continue;
    if (i + n > script.length) break;
    out.push(script.subarray(i, i + n));
    i += n;
  }
  return out;
}

/** Petit entier encodé en push de script (little-endian, signe sur le dernier octet). */
export function scriptNum(b: Buffer): number {
  if (!b.length) return 0;
  let v = 0;
  for (let i = 0; i < b.length; i++) v |= b[i] << (8 * i);
  if (b[b.length - 1] & 0x80) v = -(v & ~(0x80 << (8 * (b.length - 1))));
  return v;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58check(version: number, payload: Buffer): string {
  const data = Buffer.concat([Buffer.from([version]), payload]);
  const full = Buffer.concat([data, sha256d(data).subarray(0, 4)]);
  let n = BigInt("0x" + full.toString("hex"));
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const byte of full) { if (byte === 0) s = "1" + s; else break; }
  return s;
}

/** Adresse Dogecoin d'une sortie (P2PKH « D… » ou P2SH « 9…/A… »), null pour les autres scripts. */
export function addressOf(script: Buffer): string | null {
  if (script.length === 25 && script[0] === 0x76 && script[1] === 0xa9 && script[2] === 0x14 && script[23] === 0x88 && script[24] === 0xac) return base58check(0x1e, script.subarray(3, 23));
  if (script.length === 23 && script[0] === 0xa9 && script[1] === 0x14 && script[22] === 0x87) return base58check(0x16, script.subarray(2, 22));
  return null;
}
