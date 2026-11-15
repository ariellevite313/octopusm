/**
 * Boucle de l'indexer : suit la chaîne Dogecoin avec quelques confirmations d'avance (pas de réorganisation à gérer),
 * traite chaque bloc et l'écrit en base. Reprend tout seul là où il s'était arrêté.
 *
 * Variables d'environnement (fichier .env du serveur, jamais dans le code) :
 *   DOGE_RPC_URL (ex. http://127.0.0.1:22555), DOGE_RPC_USER, DOGE_RPC_PASS
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   START_HEIGHT  premier bloc à lire (avant les premiers deploy DRC-20), CONFIRMATIONS (défaut 6)
 *   PRUNE_KEEP    avec un nœud en élagage manuel (prune=1) : nombre de blocs gardés derrière l'indexer (défaut 2000).
 *                 L'indexer dit au nœud d'effacer les blocs déjà lus, le disque reste petit.
 */
import { parseBlock } from "./chain.js";
import { DbStore } from "./db-store.js";
import type { Partial } from "./doginals.js";
import { processBlock, RecentOutputs } from "./engine.js";

const env = (k: string, d?: string) => { const v = process.env[k] ?? d; if (v === undefined) throw new Error(`missing env ${k}`); return v; };

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const auth = Buffer.from(`${env("DOGE_RPC_USER")}:${env("DOGE_RPC_PASS")}`).toString("base64");
  const r = await fetch(env("DOGE_RPC_URL", "http://127.0.0.1:22555"), {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({ jsonrpc: "1.0", id: "drc20", method, params }), signal: AbortSignal.timeout(60_000),
  });
  const j = (await r.json().catch(() => null)) as { result?: T; error?: { message?: string } } | null;
  if (!j || j.error) throw new Error(`rpc ${method}: ${j?.error?.message ?? r.status}`);
  return j.result as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

async function main() {
  const conf = Number(env("CONFIRMATIONS", "6"));
  const pruneKeep = Number(env("PRUNE_KEEP", "2000"));
  let store!: DbStore, next = 0, prevHash: string | null = null;
  let ctx = { partials: new Map<string, Partial>(), recent: new RecentOutputs(), log };
  // (Re)part de l'état enregistré en base : après une erreur, rien de ce qui n'a pas été écrit n'est gardé en mémoire
  const reset = async () => {
    store = new DbStore(env("SUPABASE_URL"), env("SUPABASE_SERVICE_KEY"));
    await store.load();
    const st = await store.state();
    next = st ? st.height + 1 : Number(env("START_HEIGHT"));
    prevHash = st?.hash ?? null;
    ctx = { partials: new Map<string, Partial>(), recent: new RecentOutputs(), log };
  };
  await reset();
  log(`start at block ${next} (${store.tokens.size} tokens, ${store.pending.size} pending transfers)`);

  for (;;) {
    try {
      const tip = (await rpc<number>("getblockcount")) - conf;
      if (next > tip) { await sleep(30_000); continue; }
      const t0 = Date.now();
      for (; next <= tip; next++) {
        const hash = await rpc<string>("getblockhash", [next]);
        const block = parseBlock(await rpc<string>("getblock", [hash, false]));
        if (prevHash && block.prevHash !== prevHash) throw new Error(`chain mismatch at ${next}: increase CONFIRMATIONS and re-sync`);
        const s = await processBlock(block, next, store, ctx);
        // Blocs sans DRC-20 : on n'écrit que la hauteur, tous les 500 blocs ou au sommet
        if (store.hasChanges() || next % 500 === 0 || next === tip) await store.commit(next, block.hash);
        prevHash = block.hash;
        if (pruneKeep > 0 && next % 1000 === 0 && next - pruneKeep > 0) await rpc("pruneblockchain", [next - pruneKeep]).catch(() => {});
        if (s.drc20 || next % 1000 === 0) log(`block ${next}: ${s.inscriptions} inscriptions, ${s.drc20} drc-20 (${s.rejected} rejected), ${s.transfers} transfers${s.approx ? `, ${s.approx} approx` : ""}`);
        if (Date.now() - t0 > 60_000) break; // revoir le sommet de la chaîne de temps en temps
      }
    } catch (e) {
      log(`error: ${(e as Error).message}`);
      if (/chain mismatch/.test((e as Error).message)) process.exit(1);
      await sleep(10_000);
      await reset().catch((err) => log(`reset failed: ${(err as Error).message}`));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
