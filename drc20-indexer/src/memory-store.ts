/** État en mémoire : pour les tests, et comme couche de travail d'un bloc avant l'écriture en base. */
import type { Balance, Ev, Pending, Store, Token } from "./drc20.js";

export class MemoryStore implements Store {
  tokens = new Map<string, Token>();
  balances = new Map<string, Balance>();
  pending = new Map<string, Pending>();
  events: Ev[] = [];
  /** Clés modifiées depuis le dernier vidage (pour n'écrire que ce qui a changé). */
  dirty = { tokens: new Set<string>(), balances: new Set<string>(), pendingPut: new Set<string>(), pendingDrop: new Set<string>() };

  async token(tick: string) { const t = this.tokens.get(tick); return t ? { ...t } : null; }
  async putToken(t: Token) { this.tokens.set(t.tick, { ...t }); this.dirty.tokens.add(t.tick); }
  async balance(tick: string, addr: string) { const b = this.balances.get(`${tick}|${addr}`); return b ? { ...b } : { avail: 0n, trans: 0n }; }
  async putBalance(tick: string, addr: string, b: Balance) { this.balances.set(`${tick}|${addr}`, { ...b }); this.dirty.balances.add(`${tick}|${addr}`); }
  async pendingAt(txid: string, vout: number) { return [...this.pending.values()].filter((p) => p.txid === txid && p.vout === vout).map((p) => ({ ...p })); }
  async putPending(p: Pending) { this.pending.set(p.id, { ...p }); this.dirty.pendingPut.add(p.id); this.dirty.pendingDrop.delete(p.id); }
  async dropPending(id: string) { this.pending.delete(id); this.dirty.pendingDrop.add(id); this.dirty.pendingPut.delete(id); }
  async event(e: Ev) { this.events.push(e); }
}
