/**
 * Récupération d'un lancement Solana resté "pending" : cherche la pool DBC du token sur la chaîne
 * et, si elle existe, active le token. Utilisé par /check-pool (page du token) et par le cron de rattrapage.
 */
import { ensureLaunchFeePaid } from "@/lib/launch/fee-check";
import { DOGE_MINT } from "@/lib/solana/doge";
import { PAIR_QUOTES } from "@/lib/solana/quotes";
import { solanaConnection } from "@/lib/solana/rpc";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { getXStockMint } from "@/lib/solana/xstocks";
import { verifyTokenCreator } from "@/lib/launch/verify-creator";
import { awardOcto, OMERO_PER_LAUNCH } from "@/lib/octo";

const BLOWFISH_SAFE = new Set([
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1Rd3",
  "SysvarRent111111111111111111111111111111111",
  "ComputeBudget111111111111111111111111111111",
]);

/** Discriminateur Anchor du compte VirtualPool de Meteora DBC, et position du base_mint dans ses données. */
const POOL_DISCRIMINATOR = Buffer.from("d5e005d16245775c", "hex");
const POOL_BASE_MINT_OFFSET = 136;

/** Plus anciennes signatures d'une adresse (la création du token est la toute première). */
export async function oldestSignatures(connection: Connection, address: string, count = 3): Promise<{ signature: string; blockTime: number | null }[]> {
  let before: string | undefined;
  let last: { signature: string; blockTime?: number | null }[] = [];
  for (let page = 0; page < 6; page++) {
    const batch = await connection.getSignaturesForAddress(new PublicKey(address), { limit: 1000, before }, "confirmed").catch(() => []);
    if (!batch.length) break;
    last = [...last, ...batch].slice(-count - 1000);
    before = batch[batch.length - 1].signature;
    if (batch.length < 1000) break;
  }
  return last.slice(-count).reverse().map((x) => ({ signature: x.signature, blockTime: x.blockTime ?? null }));
}

/**
 * Trouve la pool sans deviner son adresse : lit la transaction de création du token et garde le compte
 * du programme DBC dont les données disent « base_mint = ce token ». Marche quelle que soit la config utilisée
 * (y compris une config créée pour ce lancement seulement).
 */
export async function findPoolFromHistory(connection: Connection, mintAddress: string, dbcProgramId: PublicKey): Promise<{ pool: string; signature: string; blockTime: number | null } | null> {
  const mint = new PublicKey(mintAddress);
  for (const s of await oldestSignatures(connection, mintAddress, 3)) {
    const tx = await connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
    if (!tx?.meta || tx.meta.err) continue;
    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses });
    const all: PublicKey[] = [];
    for (let i = 0; i < keys.length; i++) { const k = keys.get(i); if (k) all.push(k); }
    // Par paquets de 10 : certains RPC refusent plus de 10 comptes par requête
    const infos: (Awaited<ReturnType<Connection["getAccountInfo"]>>)[] = [];
    for (let k = 0; k < all.length; k += 10) {
      const part = await connection.getMultipleAccountsInfo(all.slice(k, k + 10), "confirmed").catch(() => all.slice(k, k + 10).map(() => null));
      infos.push(...part);
    }
    for (let i = 0; i < all.length; i++) {
      const info = infos[i];
      if (!info || !info.owner.equals(dbcProgramId) || info.data.length < POOL_BASE_MINT_OFFSET + 32) continue;
      if (!info.data.subarray(0, 8).equals(POOL_DISCRIMINATOR)) continue;
      if (!info.data.subarray(POOL_BASE_MINT_OFFSET, POOL_BASE_MINT_OFFSET + 32).equals(mint.toBuffer())) continue;
      return { pool: all[i].toBase58(), signature: s.signature, blockTime: tx.blockTime ?? s.blockTime };
    }
  }
  // Dernier recours (historique indisponible sur ce RPC) : recherche directe des pools DBC dont base_mint = ce token
  try {
    const found = await connection.getProgramAccounts(dbcProgramId, {
      commitment: "confirmed",
      dataSlice: { offset: 0, length: 0 },
      filters: [{ memcmp: { offset: 0, bytes: bs58Encode(POOL_DISCRIMINATOR) } }, { memcmp: { offset: POOL_BASE_MINT_OFFSET, bytes: mint.toBase58() } }],
    });
    if (found[0]) {
      const pool = found[0].pubkey.toBase58();
      const first = (await oldestSignatures(connection, pool, 1))[0];
      return { pool, signature: first?.signature ?? "", blockTime: first?.blockTime ?? null };
    }
  } catch { /* RPC sans getProgramAccounts */ }
  return null;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58Encode(buf: Buffer): string {
  let n = BigInt("0x" + (buf.toString("hex") || "0")), out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of buf) { if (b === 0) out = "1" + out; else break; }
  return out;
}

export async function findPoolOnChain(
  connection: Connection,
  mintAddress: string,
  dbcProgramId: PublicKey,
  xStockConfigAddress?: string | null,  // dbc_config_address (xStock only)
  xStockSymbol?: string | null,          // stock_symbol (xStock only)
): Promise<string | null> {
  const baseMint  = new PublicKey(mintAddress);
  const solConfigs = [process.env.DBC_CONFIG_KEY, process.env.DBC_CONFIG_KEY_LOW, xStockSymbol ? null : xStockConfigAddress].filter(Boolean).map((k) => new PublicKey(k as string));

  const seedSets: Buffer[][] = [];

  // ── xStock pool: ["pool", configKey, sorted(quoteMint, baseMint)] ──────────
  // The DBC pool PDA canonical ordering: larger buffer key first.
  if (xStockConfigAddress && xStockSymbol) {
    const xStockMintStr = getXStockMint(xStockSymbol);
    if (xStockMintStr) {
      try {
        const xConfig  = new PublicKey(xStockConfigAddress);
        const quoteMint = new PublicKey(xStockMintStr);
        const isQuoteBigger = quoteMint.toBuffer().compare(baseMint.toBuffer()) > 0;
        seedSets.push([
          Buffer.from("pool"),
          xConfig.toBuffer(),
          isQuoteBigger ? quoteMint.toBuffer() : baseMint.toBuffer(),
          isQuoteBigger ? baseMint.toBuffer()  : quoteMint.toBuffer(),
        ]);
      } catch { /* invalid key — fall through */ }
    }
  }

  // ── SOL pool: ["pool", solConfig, sorted(SOL, baseMint)] and legacy variants ─
  for (const solConfig of solConfigs) {
    const wsol = new PublicKey("So11111111111111111111111111111111111111112");
    const isWsolBigger = wsol.toBuffer().compare(baseMint.toBuffer()) > 0;
    seedSets.push([
      Buffer.from("pool"),
      solConfig.toBuffer(),
      isWsolBigger ? wsol.toBuffer()     : baseMint.toBuffer(),
      isWsolBigger ? baseMint.toBuffer() : wsol.toBuffer(),
    ]);
    // Legacy 3-seed variants (older SDK versions)
    seedSets.push([Buffer.from("virtual_pool"), solConfig.toBuffer(), baseMint.toBuffer()]);
    seedSets.push([Buffer.from("pool"),         solConfig.toBuffer(), baseMint.toBuffer()]);
  }
  // ── DOGE pool (DSOL-20) : ["pool", dogeConfig, sorted(DOGE, baseMint)] ──
  for (const k of [process.env.DBC_CONFIG_KEY_DOGE, process.env.DBC_CONFIG_KEY_DOGE_LOW].filter(Boolean)) {
    try {
      const cfg = new PublicKey(k as string), doge = new PublicKey(DOGE_MINT);
      const big = doge.toBuffer().compare(baseMint.toBuffer()) > 0;
      seedSets.push([Buffer.from("pool"), cfg.toBuffer(), big ? doge.toBuffer() : baseMint.toBuffer(), big ? baseMint.toBuffer() : doge.toBuffer()]);
    } catch { /* clé invalide */ }
  }
  // ── Pools PEPE et CLT : même schéma que DOGE ──
  for (const pq of [PAIR_QUOTES.pepe, PAIR_QUOTES.clt]) {
    for (const k of [process.env[pq.configEnv], process.env[`${pq.configEnv}_LOW`]].filter(Boolean)) {
      try {
        const cfg = new PublicKey(k as string), q = new PublicKey(pq.mint);
        const big = q.toBuffer().compare(baseMint.toBuffer()) > 0;
        seedSets.push([Buffer.from("pool"), cfg.toBuffer(), big ? q.toBuffer() : baseMint.toBuffer(), big ? baseMint.toBuffer() : q.toBuffer()]);
      } catch { /* clé invalide */ }
    }
  }
  // Legacy 2-seed fallbacks
  seedSets.push([Buffer.from("virtual_pool"), baseMint.toBuffer()]);
  seedSets.push([Buffer.from("pool"),         baseMint.toBuffer()]);

  for (const seeds of seedSets) {
    try {
      const [pda] = PublicKey.findProgramAddressSync(seeds, dbcProgramId);
      const info = await connection.getAccountInfo(pda);
      if (info !== null) {
        console.log("[check-pool] found pool at PDA:", pda.toBase58());
        return pda.toBase58();
      }
    } catch { /* try next */ }
  }
  return null;
}


export type PendingToken = {
  id: string;
  status: string;
  mint_address: string | null;
  creator_wallet: string | null;
  tx_base64: string | null;
  is_scheduled: boolean | null;
  stock_symbol: string | null;
  dbc_config_address: string | null;
};

export type RecoverReason = "no_pool" | "creator_mismatch" | "creator_unverified" | "fee_missing" | "no_rpc";
export const RECOVER_MESSAGES: Record<RecoverReason, string> = {
  no_pool: "The pool of this token was not found on chain yet. Wait a minute and retry.",
  creator_mismatch: "The creator of this pool on chain is not the wallet that created the token.",
  creator_unverified: "Could not read the pool on chain right now. Retry in a minute.",
  fee_missing: "The launch fee payment was not found for this token. Contact support with your token address.",
  no_rpc: "Could not read the blockchain right now. Retry in a minute.",
};

/** Renvoie l'adresse de la pool trouvée (et active le token), ou null si elle n'existe pas (encore). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function activateIfPoolExists(admin: any, token: PendingToken): Promise<string | null> {
  const r = await recoverPendingToken(admin, token);
  return "pool" in r ? r.pool : null;
}

/** Même chose, avec la raison exacte quand ça échoue (affichée au créateur). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recoverPendingToken(admin: any, token: PendingToken): Promise<{ pool: string } | { reason: RecoverReason }> {
  if (!token.mint_address) return { reason: "no_pool" };
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) return { reason: "no_rpc" };
  const connection = solanaConnection();

  let dbcProgramId: PublicKey | null = null;
  if (token.tx_base64) {
    try {
      const cached = JSON.parse(token.tx_base64) as { b?: string };
      if (cached.b) {
        const txB = Transaction.from(Buffer.from(cached.b, "base64"));
        const dbcIx = txB.instructions.find(ix => !BLOWFISH_SAFE.has(ix.programId.toBase58()));
        if (dbcIx) dbcProgramId = dbcIx.programId;
      }
    } catch { /* repli sur l'ID connu */ }
  }
  const KNOWN_DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
  const programsToTry: PublicKey[] = dbcProgramId ? [dbcProgramId, new PublicKey(KNOWN_DBC_PROGRAM)] : [new PublicKey(KNOWN_DBC_PROGRAM)];

  let poolAddress: string | null = null;
  for (const prog of programsToTry) {
    poolAddress = await findPoolOnChain(connection, token.mint_address, prog, token.dbc_config_address, token.stock_symbol);
    if (poolAddress) break;
  }
  // Repli sûr : la transaction de création du token dit où est sa pool (config propre au lancement, etc.)
  let created: { signature: string; blockTime: number | null } | null = null;
  for (const prog of programsToTry) {
    const h = await findPoolFromHistory(connection, token.mint_address, prog).catch(() => null);
    if (h) { created = h; if (!poolAddress) { poolAddress = h.pool; console.log(`[recover-pool] pool found from creation tx: ${h.pool} (token ${token.id})`); } break; }
  }
  if (!poolAddress) return { reason: "no_pool" };

  // Même exigence que /confirm : le créateur lu sur la chaîne doit être celui du token.
  const verdict = await verifyTokenCreator({
    chain: "solana",
    mint_address: token.mint_address,
    pool_address: poolAddress,
    creator_wallet: token.creator_wallet,
  });
  // Comme /confirm : seul un créateur vérifié sur la chaîne active le token (une lecture RPC ratée ne suffit plus).
  if (verdict !== "ok") {
    if (verdict === "mismatch") console.error(`[recover-pool] creator mismatch for token ${token.id}`);
    return { reason: verdict === "mismatch" ? "creator_mismatch" : "creator_unverified" };
  }
  // Pas de token actif sans frais de création payés. Le paiement est cherché juste avant la création de la pool,
  // pas « dans les 2 dernières heures » : un lancement récupéré des jours plus tard est retrouvé aussi.
  if (!(await ensureLaunchFeePaid(admin, token.id, null, created?.signature ? { signature: created.signature, blockTime: created.blockTime } : null))) {
    console.warn(`[recover-pool] launch fee not found for token ${token.id}`);
    return { reason: "fee_missing" };
  }

  const isScheduled = Boolean(token.is_scheduled);
  const { data: flipped } = await admin.from("launchpad_tokens").update({
    status:         "active",
    is_tradeable:   !isScheduled,
    pool_address:   poolAddress,
    creator_verified:    verdict === "ok",
    creator_verified_at: verdict === "ok" ? new Date().toISOString() : null,
    tx_base64:      null,
    tx_prepared_at: null,
    vanity_secret_key: null,
    ...(token.stock_symbol ? { dbc_config_secret: null } : {}),
  }).eq("id", token.id).eq("status", "pending").select("id");

  // La clé privée du token ne sert plus : on l'efface aussi de la réserve vanity
  if (flipped?.length) { try { await admin.rpc("clear_vanity_secret", { p_token_id: token.id }); } catch { /* non bloquant */ } }
  // Même récompense que /confirm, une seule fois (seul l'appel qui a fait passer le token en actif la donne).
  if (flipped?.length && token.creator_wallet && verdict === "ok") {
    awardOcto(token.creator_wallet, OMERO_PER_LAUNCH, "launch").catch((e) => console.warn("[recover-pool] awardOcto:", e));
  }
  return { pool: poolAddress };
}
