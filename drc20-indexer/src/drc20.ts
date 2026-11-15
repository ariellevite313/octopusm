/**
 * Règles DRC-20 (BRC-20 adapté à Dogecoin / Doginals) :
 *  - deploy   {"p":"drc-20","op":"deploy","tick":"dogi","max":"21000000","lim":"1000","dec":"8"}  (dec : 18 par défaut)
 *  - mint     {"p":"drc-20","op":"mint","tick":"dogi","amt":"1000"}  crédité au propriétaire de l'inscription, plafonné au reste
 *  - transfer {"p":"drc-20","op":"transfer","tick":"dogi","amt":"10"} en deux temps : l'inscription bloque le montant
 *    (disponible → transférable) chez son propriétaire, puis l'envoi de cette inscription le donne au destinataire.
 *    Envoyée en frais : le montant revient à l'expéditeur. Envoyée vers un OP_RETURN : brûlée.
 * Le ticker est insensible à la casse (stocké en minuscules). Les montants sont des entiers à l'échelle 10^dec.
 */
export const MAX_DEC = 18;
export const MAX_AMOUNT = (1n << 128n) - 1n;

export type Token = { tick: string; max: bigint; lim: bigint; dec: number; minted: bigint; deployer: string; inscription: string; height: number };
export type Balance = { avail: bigint; trans: bigint };
export type Pending = { id: string; tick: string; amt: bigint; from: string; txid: string; vout: number; offset: bigint };
export type Ev = { height: number; txid: string; kind: "deploy" | "mint" | "inscribe_transfer" | "transfer" | "return" | "burn"; tick: string; from: string | null; to: string | null; amt: bigint; inscription: string };

/** Accès à l'état (base de données en production, mémoire dans les tests). */
export interface Store {
  token(tick: string): Promise<Token | null>;
  putToken(t: Token): Promise<void>;
  balance(tick: string, addr: string): Promise<Balance>;
  putBalance(tick: string, addr: string, b: Balance): Promise<void>;
  pendingAt(txid: string, vout: number): Promise<Pending[]>;
  putPending(p: Pending): Promise<void>;
  dropPending(id: string): Promise<void>;
  event(e: Ev): Promise<void>;
}

/** "1.5" avec dec=8 → 150000000n ; null si invalide (signe, lettres, trop de décimales, zéro, trop grand). */
export function parseAmount(s: unknown, dec: number): bigint | null {
  if (typeof s !== "string" || !/^\d+(\.\d+)?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  if (f.length > dec) return null;
  const v = BigInt(i) * 10n ** BigInt(dec) + BigInt((f + "0".repeat(dec)).slice(0, dec) || "0");
  return v > 0n && v <= MAX_AMOUNT ? v : null;
}

export function formatAmount(v: bigint, dec: number): string {
  const s = v.toString().padStart(dec + 1, "0");
  const i = s.slice(0, s.length - dec), f = s.slice(s.length - dec).replace(/0+$/, "");
  return f ? `${i}.${f}` : i;
}

type Op = { op: "deploy" | "mint" | "transfer"; tick: string; raw: Record<string, unknown> };

/** Contenu d'inscription → opération DRC-20, ou null. */
export function readOp(contentType: string, body: Buffer): Op | null {
  const ct = contentType.toLowerCase();
  if (!ct.startsWith("text/plain") && !ct.startsWith("application/json")) return null;
  if (body.length > 1024) return null;
  let j: unknown;
  try { j = JSON.parse(body.toString("utf8")); } catch { return null; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  if (typeof o.p !== "string" || o.p.toLowerCase() !== "drc-20") return null;
  if (o.op !== "deploy" && o.op !== "mint" && o.op !== "transfer") return null;
  if (typeof o.tick !== "string" || [...o.tick].length !== 4) return null;
  return { op: o.op, tick: o.tick.toLowerCase(), raw: o };
}

const add = async (s: Store, tick: string, addr: string, f: (b: Balance) => void) => { const b = await s.balance(tick, addr); f(b); await s.putBalance(tick, addr, b); };

/** Inscription révélée : `owner` = adresse de la sortie 0 de la transaction (null si non standard). */
export async function applyInscription(s: Store, op: Op, ctx: { id: string; txid: string; owner: string | null; height: number }): Promise<string | null> {
  if (!ctx.owner) return "no owner";
  const t = await s.token(op.tick);
  if (op.op === "deploy") {
    if (t) return "already deployed";
    const dec = op.raw.dec === undefined ? MAX_DEC : typeof op.raw.dec === "string" && /^\d{1,2}$/.test(op.raw.dec) ? Number(op.raw.dec) : -1;
    if (dec < 0 || dec > MAX_DEC) return "bad dec";
    const max = parseAmount(op.raw.max, dec);
    if (!max) return "bad max";
    const lim = op.raw.lim === undefined ? max : parseAmount(op.raw.lim, dec);
    if (!lim) return "bad lim";
    await s.putToken({ tick: op.tick, max, lim: lim > max ? max : lim, dec, minted: 0n, deployer: ctx.owner, inscription: ctx.id, height: ctx.height });
    await s.event({ height: ctx.height, txid: ctx.txid, kind: "deploy", tick: op.tick, from: null, to: ctx.owner, amt: 0n, inscription: ctx.id });
    return null;
  }
  if (!t) return "unknown tick";
  const amt = parseAmount(op.raw.amt, t.dec);
  if (!amt) return "bad amt";
  if (op.op === "mint") {
    if (amt > t.lim) return "over limit";
    const left = t.max - t.minted;
    if (left <= 0n) return "fully minted";
    const got = amt > left ? left : amt;
    t.minted += got;
    await s.putToken(t);
    await add(s, op.tick, ctx.owner, (b) => { b.avail += got; });
    await s.event({ height: ctx.height, txid: ctx.txid, kind: "mint", tick: op.tick, from: null, to: ctx.owner, amt: got, inscription: ctx.id });
    return null;
  }
  // transfer : inscription
  const b = await s.balance(op.tick, ctx.owner);
  if (b.avail < amt) return "insufficient balance";
  b.avail -= amt; b.trans += amt;
  await s.putBalance(op.tick, ctx.owner, b);
  await s.putPending({ id: ctx.id, tick: op.tick, amt, from: ctx.owner, txid: ctx.txid, vout: 0, offset: 0n });
  await s.event({ height: ctx.height, txid: ctx.txid, kind: "inscribe_transfer", tick: op.tick, from: ctx.owner, to: ctx.owner, amt, inscription: ctx.id });
  return null;
}

/** L'inscription de transfert est dépensée : `dest` = adresse qui la reçoit, "fee" (frais) ou "burn" (OP_RETURN). */
export async function applyTransferSpend(s: Store, p: Pending, dest: string | "fee" | "burn", ctx: { txid: string; height: number }) {
  await s.dropPending(p.id);
  if (dest === "fee") {
    await add(s, p.tick, p.from, (b) => { b.trans -= p.amt; b.avail += p.amt; });
    await s.event({ height: ctx.height, txid: ctx.txid, kind: "return", tick: p.tick, from: p.from, to: p.from, amt: p.amt, inscription: p.id });
  } else if (dest === "burn") {
    await add(s, p.tick, p.from, (b) => { b.trans -= p.amt; });
    await s.event({ height: ctx.height, txid: ctx.txid, kind: "burn", tick: p.tick, from: p.from, to: null, amt: p.amt, inscription: p.id });
  } else {
    await add(s, p.tick, p.from, (b) => { b.trans -= p.amt; });
    await add(s, p.tick, dest, (b) => { b.avail += p.amt; });
    await s.event({ height: ctx.height, txid: ctx.txid, kind: "transfer", tick: p.tick, from: p.from, to: dest, amt: p.amt, inscription: p.id });
  }
}
