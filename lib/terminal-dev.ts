/**
 * Analyse du dev d'un token Solana : son portefeuille, ce qu'il détient encore, ce qu'il a vendu ou envoyé récemment,
 * et les adresses qui ont reçu ses tokens. Données lues sur la blockchain, mises en cache 2 minutes.
 */
import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { solanaConnection } from "@/lib/solana/rpc";
import { RUG_EXEMPT } from "@/lib/terminal-rug";

/** sale : vente sur un DEX (swap) · transfer : envoi direct vers un autre wallet */
export type DevMove = { signature: string; time: number | null; amount: number; kind: "sale" | "transfer"; recipients: { owner: string; amount: number }[] };
export type DevInfo = {
  dev: string | null;
  /** holding : rien vendu ni envoyé · selling : au moins une vente · sold_all : ventes et plus rien en wallet · sending : envois directs seulement */
  status: "unknown" | "holding" | "selling" | "sold_all" | "sending";
  holds: number; holdsPct: number; supply: number;
  /** Total vendu sur un DEX dans les dernières transactions, et sa part du supply */
  soldTotal: number; soldPct: number;
  /** Total envoyé directement à d'autres wallets, et sa part du supply */
  sentTotal: number; sentPct: number;
  moves: DevMove[];
  note?: string;
};

/** Programmes de swap : Jupiter, Raydium, Orca, Meteora, pump.fun, PumpSwap. Un mouvement qui passe par l'un d'eux est une vente. */
const DEX_PROGRAMS = new Set([
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB", "JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo", "JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK", "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C", "routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc", "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP",
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo", "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG", "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB", "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
]);

function isSwap(tx: ParsedTransactionWithMeta): boolean {
  const ids = new Set<string>();
  for (const ix of tx.transaction.message.instructions) ids.add(ix.programId.toBase58());
  for (const inner of tx.meta?.innerInstructions ?? []) for (const ix of inner.instructions) ids.add(ix.programId.toBase58());
  for (const k of tx.transaction.message.accountKeys) ids.add(k.pubkey.toBase58());
  for (const id of ids) if (DEX_PROGRAMS.has(id)) return true;
  return false;
}

const cache = new Map<string, { at: number; v: DevInfo }>();
const TTL = 120_000;
const MAX_PAGES = 8;

/** Le déployeur : l'auteur de la toute première transaction qui touche le mint. */
async function findDeployer(mint: PublicKey): Promise<string | null> {
  const conn = solanaConnection();
  let before: string | undefined;
  let oldest: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await conn.getSignaturesForAddress(mint, { limit: 1000, before });
    if (!page.length) break;
    oldest = page[page.length - 1].signature;
    if (page.length < 1000) { before = undefined; break; }
    before = oldest;
    if (i === MAX_PAGES - 1) return null; // token trop actif : déployeur introuvable à coût raisonnable
  }
  if (!oldest) return null;
  const tx = await conn.getParsedTransaction(oldest, { maxSupportedTransactionVersion: 0 });
  const first = tx?.transaction.message.accountKeys?.[0]?.pubkey;
  return first ? first.toBase58() : null;
}

/** Vrai wallet (adresse sur la courbe ed25519). Un pool de liquidité, une courbe de lancement ou un coffre de programme
 *  est une adresse dérivée (PDA), hors courbe : ce n'est jamais le dev ni « un wallet qui a reçu ses tokens ». */
function isWallet(a: string): boolean {
  try { return PublicKey.isOnCurve(new PublicKey(a).toBytes()); } catch { return false; }
}

/** Créateur selon RugCheck (fiable pour pump.fun, Meteora, LaunchLab…), si disponible. */
async function rugcheckCreator(mint: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, { signal: AbortSignal.timeout(8000), next: { revalidate: 600 } });
    if (!r.ok) return null;
    const j = (await r.json()) as { creator?: string | null };
    return j.creator && isWallet(j.creator) ? j.creator : null;
  } catch { return null; }
}

function movement(tx: ParsedTransactionWithMeta, mint: string, dev: string) {
  const pre = tx.meta?.preTokenBalances ?? [], post = tx.meta?.postTokenBalances ?? [];
  const sum = (arr: typeof pre, owner: string) => arr.filter((b) => b.mint === mint && b.owner === owner).reduce((s, b) => s + (b.uiTokenAmount.uiAmount ?? 0), 0);
  const delta = sum(post, dev) - sum(pre, dev);
  const owners = new Set([...pre, ...post].filter((b) => b.mint === mint && b.owner && b.owner !== dev).map((b) => b.owner as string));
  const recipients = [...owners].map((o) => ({ owner: o, amount: sum(post, o) - sum(pre, o) })).filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount);
  return { delta, recipients };
}

export async function analyzeDev(mintStr: string, creatorHint?: string | null): Promise<DevInfo> {
  const hit = cache.get(mintStr);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const empty: DevInfo = { dev: null, status: "unknown", holds: 0, holdsPct: 0, supply: 0, soldTotal: 0, soldPct: 0, sentTotal: 0, sentPct: 0, moves: [] };
  if (RUG_EXEMPT.has(mintStr)) return empty;
  const conn = solanaConnection();
  const mint = new PublicKey(mintStr);
  const supplyRes = await conn.getTokenSupply(mint);
  const supply = supplyRes.value.uiAmount ?? 0;
  // Le dev doit être un vrai wallet : jamais un pool de liquidité ni un compte de programme
  let dev = creatorHint && isWallet(creatorHint) ? creatorHint : await rugcheckCreator(mintStr);
  if (!dev) { const d = await findDeployer(mint).catch(() => null); dev = d && isWallet(d) ? d : null; }
  if (!dev) { const v = { ...empty, supply, note: "Developer wallet not found" }; cache.set(mintStr, { at: Date.now(), v }); return v; }
  const owner = new PublicKey(dev);
  const accounts = await conn.getParsedTokenAccountsByOwner(owner, { mint });
  const holds = accounts.value.reduce((s, a) => s + (a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0), 0);

  // Dernières transactions des comptes de token du dev
  const sigs: { signature: string; blockTime?: number | null }[] = [];
  for (const a of accounts.value.slice(0, 3)) {
    const s = await conn.getSignaturesForAddress(a.pubkey, { limit: 20 }).catch(() => []);
    sigs.push(...s);
  }
  const uniq = [...new Map(sigs.filter(Boolean).map((s) => [s.signature, s])).values()].sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0)).slice(0, 15);
  const txs = uniq.length ? await conn.getParsedTransactions(uniq.map((s) => s.signature), { maxSupportedTransactionVersion: 0 }).catch(() => []) : [];
  const moves: DevMove[] = [];
  txs.forEach((tx, i) => {
    if (!tx || tx.meta?.err) return;
    const m = movement(tx, mintStr, dev);
    if (m.delta >= 0) return;
    if (isSwap(tx)) { moves.push({ signature: uniq[i].signature, time: uniq[i].blockTime ?? null, amount: -m.delta, kind: "sale", recipients: [] }); return; }
    // Tokens partis vers un pool ou un programme (ajout de liquidité, lock, migration) : ni une vente ni un envoi à un wallet
    const wallets = m.recipients.filter((r) => isWallet(r.owner));
    if (!wallets.length) return;
    moves.push({ signature: uniq[i].signature, time: uniq[i].blockTime ?? null, amount: wallets.reduce((n, r) => n + r.amount, 0), kind: "transfer", recipients: wallets.slice(0, 3) });
  });
  const soldTotal = moves.filter((m) => m.kind === "sale").reduce((s, m) => s + m.amount, 0);
  const sentTotal = moves.filter((m) => m.kind === "transfer").reduce((s, m) => s + m.amount, 0);
  const sales = moves.some((m) => m.kind === "sale");
  const status: DevInfo["status"] = sales ? (holds <= 0 ? "sold_all" : "selling") : moves.length ? "sending" : "holding";
  const pc = (n: number) => (supply > 0 ? (n / supply) * 100 : 0);
  const v: DevInfo = { dev, status, holds, holdsPct: pc(holds), supply, soldTotal, soldPct: pc(soldTotal), sentTotal, sentPct: pc(sentTotal), moves: moves.slice(0, 6) };
  cache.set(mintStr, { at: Date.now(), v });
  return v;
}
