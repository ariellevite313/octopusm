/**
 * État en base (Supabase / Postgres). Les tokens et les transferts en attente tiennent en mémoire (chargés au démarrage) ;
 * les soldes sont lus à la demande. Chaque bloc est écrit d'un seul coup par drc20_commit_block.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Balance, Pending, Token } from "./drc20.js";
import { MemoryStore } from "./memory-store.js";

type Row = Record<string, string | number | null>;
const big = (v: unknown) => BigInt(String(v ?? "0").split(".")[0]);

export class DbStore extends MemoryStore {
  db: SupabaseClient;
  private loaded = new Set<string>();
  constructor(url: string, key: string) { super(); this.db = createClient(url, key, { auth: { persistSession: false } }); }

  /** Dernier bloc indexé (null si aucun). */
  async state(): Promise<{ height: number; hash: string } | null> {
    const { data, error } = await this.db.from("drc20_state").select("height, hash").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return data as { height: number; hash: string } | null;
  }

  private async all(table: string, cols: string): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db.from(table).select(cols).range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as unknown as Row[]));
      if (!data || data.length < 1000) return out;
    }
  }

  async load() {
    for (const r of await this.all("drc20_tokens", "tick, max_supply, lim, dec, minted, deployer, inscription, height")) {
      this.tokens.set(String(r.tick), { tick: String(r.tick), max: big(r.max_supply), lim: big(r.lim), dec: Number(r.dec), minted: big(r.minted), deployer: String(r.deployer), inscription: String(r.inscription), height: Number(r.height) });
    }
    for (const r of await this.all("drc20_pending", "id, tick, amt, sender, txid, vout, offset")) {
      this.pending.set(String(r.id), { id: String(r.id), tick: String(r.tick), amt: big(r.amt), from: String(r.sender), txid: String(r.txid), vout: Number(r.vout), offset: big(r.offset) });
    }
  }

  override async balance(tick: string, addr: string): Promise<Balance> {
    const k = `${tick}|${addr}`;
    if (!this.loaded.has(k) && !this.balances.has(k)) {
      const { data, error } = await this.db.from("drc20_balances").select("avail, trans").eq("tick", tick).eq("address", addr).maybeSingle();
      if (error) throw new Error(error.message);
      if (data) this.balances.set(k, { avail: big(data.avail), trans: big(data.trans) });
      this.loaded.add(k);
      if (this.loaded.size > 200_000) this.loaded.clear();
    }
    return super.balance(tick, addr);
  }

  /** Vrai s'il y a quelque chose à écrire. */
  hasChanges() { const d = this.dirty; return this.events.length > 0 || d.tokens.size + d.balances.size + d.pendingPut.size + d.pendingDrop.size > 0; }

  /** Écrit le bloc (tout ou rien) puis vide la liste des changements. */
  async commit(height: number, hash: string) {
    const d = this.dirty;
    const tokens = [...d.tokens].map((t) => this.tokens.get(t) as Token).map((t) => ({ ...t, max: t.max.toString(), lim: t.lim.toString(), minted: t.minted.toString() }));
    const balances = [...d.balances].map((k) => { const [tick, address] = k.split("|"); const b = this.balances.get(k)!; return { tick, address, avail: b.avail.toString(), trans: b.trans.toString() }; });
    const pendingPut = [...d.pendingPut].map((id) => this.pending.get(id) as Pending).filter(Boolean).map((p) => ({ ...p, amt: p.amt.toString(), offset: p.offset.toString() }));
    const events = this.events.map((e) => ({ ...e, amt: e.amt.toString() }));
    const { error } = await this.db.rpc("drc20_commit_block", { p_height: height, p_hash: hash, p_tokens: tokens, p_balances: balances, p_pending_put: pendingPut, p_pending_drop: [...d.pendingDrop], p_events: events });
    if (error) throw new Error(`commit ${height}: ${error.message}`);
    this.dirty = { tokens: new Set(), balances: new Set(), pendingPut: new Set(), pendingDrop: new Set() };
    this.events = [];
    // Les soldes vides ne servent plus en mémoire
    for (const k of balances.filter((b) => b.avail === "0" && b.trans === "0")) this.balances.delete(`${k.tick}|${k.address}`);
  }
}
