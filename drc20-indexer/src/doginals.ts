/**
 * Inscriptions Doginals (Dogecoin) : contenu inscrit dans le scriptSig d'une entrée P2SH.
 *   "ord" <nombre de morceaux> <content-type> <n-1> <données> <n-2> <données> … <0> <données> …
 * Un gros contenu peut continuer sur les transactions suivantes (chacune dépense la sortie 0 de la précédente).
 * Quand le dernier morceau (0) arrive, l'inscription est complète : son id est <txid>i0 et elle se trouve
 * sur le premier satoshi de la sortie 0 de cette transaction.
 */
import { pushes, scriptNum, type Tx } from "./chain.js";

export type Partial = { contentType: string; chunks: Buffer[]; next: number };
export type Inscription = { id: string; txid: string; contentType: string; body: Buffer };

const ORD = Buffer.from("ord");

/** Lit les paires <compte à rebours> <données> à partir de p[i]. */
function readPieces(p: Buffer[], i: number, expect: number, chunks: Buffer[]): number {
  while (expect >= 0 && i + 1 < p.length) {
    const n = p[i].length <= 4 ? scriptNum(p[i]) : -1;
    if (n !== expect) break;
    chunks.push(Buffer.from(p[i + 1]));
    expect--; i += 2;
  }
  return expect; // -1 : terminé
}

/**
 * Inscriptions d'une transaction. `partials` contient les inscriptions commencées dans des transactions précédentes,
 * indexées par la sortie qui les porte ("txid:vout") ; la fonction les complète ou les prolonge.
 */
export function inscriptionsOf(tx: Tx, partials: Map<string, Partial>): Inscription[] {
  const out: Inscription[] = [];
  for (const vin of tx.vin) {
    if (tx.coinbase) break;
    const p = pushes(vin.script);
    const key = `${vin.prevTxid}:${vin.prevVout}`;
    let cur: Partial | null = null;
    const prev = partials.get(key);
    if (prev) {
      partials.delete(key);
      cur = { ...prev, chunks: [...prev.chunks] };
      cur.next = readPieces(p, 0, cur.next, cur.chunks);
    } else if (p.length >= 3 && p[0].equals(ORD)) {
      const total = scriptNum(p[1]);
      if (total < 1 || total > 10_000) continue;
      cur = { contentType: p[2].toString("utf8").slice(0, 200), chunks: [], next: total - 1 };
      cur.next = readPieces(p, 3, cur.next, cur.chunks);
    }
    if (!cur) continue;
    // Un DRC-20 tient en 1 Ko : inutile de garder en mémoire de grosses inscriptions en plusieurs morceaux (déni de service)
    if (cur.chunks.reduce((n, c) => n + c.length, 0) > 4096) break;
    if (cur.next < 0) out.push({ id: `${tx.txid}i0`, txid: tx.txid, contentType: cur.contentType, body: Buffer.concat(cur.chunks) });
    else {
      partials.set(`${tx.txid}:0`, cur);
      // Plafond : on oublie les plus anciens morceaux en attente
      if (partials.size > 50_000) { const k = partials.keys().next().value; if (k !== undefined) partials.delete(k); }
    }
    break; // une seule inscription par transaction (première entrée qui en porte)
  }
  return out;
}
