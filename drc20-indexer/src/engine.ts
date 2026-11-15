/**
 * Traitement d'un bloc : d'abord les déplacements des inscriptions de transfert (sat par sat, règle « premier entré,
 * premier sorti »), puis les nouvelles inscriptions DRC-20, transaction après transaction, dans l'ordre du bloc.
 */
import { addressOf, type Block } from "./chain.js";
import { inscriptionsOf, type Partial } from "./doginals.js";
import { applyInscription, applyTransferSpend, readOp, type Store } from "./drc20.js";

/** Montant d'une sortie déjà existante (null si inconnu). */
export type ValueSource = (txid: string, vout: number) => Promise<bigint | null>;

/** Garde en mémoire les montants des sorties des derniers blocs (utile quand une inscription n'est pas la 1re entrée). */
export class RecentOutputs {
  private blocks: Map<string, bigint[]>[] = [];
  constructor(private keep = 30) {}
  add(block: Block) {
    const m = new Map<string, bigint[]>();
    for (const t of block.txs) m.set(t.txid, t.vout.map((o) => o.value));
    this.blocks.push(m);
    if (this.blocks.length > this.keep) this.blocks.shift();
  }
  get(txid: string, vout: number): bigint | null {
    for (let i = this.blocks.length - 1; i >= 0; i--) { const v = this.blocks[i].get(txid); if (v) return v[vout] ?? null; }
    return null;
  }
}

export type BlockStats = { inscriptions: number; drc20: number; rejected: number; transfers: number; approx: number };

export async function processBlock(block: Block, height: number, store: Store, opts: { partials: Map<string, Partial>; recent: RecentOutputs; values?: ValueSource; log?: (m: string) => void }): Promise<BlockStats> {
  const stats: BlockStats = { inscriptions: 0, drc20: 0, rejected: 0, transfers: 0, approx: 0 };
  const local = new Map<string, bigint[]>(); // sorties des transactions précédentes du même bloc
  const valueOf = async (txid: string, vout: number) => local.get(txid)?.[vout] ?? opts.recent.get(txid, vout) ?? (opts.values ? await opts.values(txid, vout).catch(() => null) : null);

  for (const tx of block.txs) {
    if (!tx.coinbase) {
      // 1. Inscriptions de transfert dépensées dans cette transaction
      for (let i = 0; i < tx.vin.length; i++) {
        const pend = await store.pendingAt(tx.vin[i].prevTxid, tx.vin[i].prevVout);
        if (!pend.length) continue;
        let before = 0n, known = true;
        for (let k = 0; k < i; k++) { const v = await valueOf(tx.vin[k].prevTxid, tx.vin[k].prevVout); if (v == null) { known = false; break; } before += v; }
        for (const p of pend) {
          let dest: string | "fee" | "burn" = "fee";
          if (!known) {
            // Montants des entrées précédentes inconnus : on suppose la sortie 0 (cas de loin le plus courant)
            stats.approx++;
            opts.log?.(`approx: inscription ${p.id} in ${tx.txid} (input ${i}) assumed on output 0`);
            dest = tx.vout[0] ? (tx.vout[0].script[0] === 0x6a ? "burn" : addressOf(tx.vout[0].script) ?? "burn") : "fee";
          } else {
            let pos = before + p.offset, cum = 0n;
            for (const o of tx.vout) {
              if (pos < cum + o.value) { dest = o.script[0] === 0x6a ? "burn" : addressOf(o.script) ?? "burn"; break; }
              cum += o.value;
            }
          }
          await applyTransferSpend(store, p, dest, { txid: tx.txid, height });
          stats.transfers++;
        }
      }
      // 2. Nouvelles inscriptions
      for (const ins of inscriptionsOf(tx, opts.partials)) {
        stats.inscriptions++;
        const op = readOp(ins.contentType, ins.body);
        if (!op) continue;
        stats.drc20++;
        const why = await applyInscription(store, op, { id: ins.id, txid: tx.txid, owner: tx.vout[0] ? addressOf(tx.vout[0].script) : null, height });
        if (why) { stats.rejected++; opts.log?.(`rejected ${op.op} ${op.tick} ${ins.id}: ${why}`); }
      }
    }
    local.set(tx.txid, tx.vout.map((o) => o.value));
  }
  opts.recent.add(block);
  return stats;
}
