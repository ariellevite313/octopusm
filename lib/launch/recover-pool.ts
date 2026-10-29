/**
 * Récupération d'un lancement Solana resté "pending" : cherche la pool DBC du token sur la chaîne
 * et, si elle existe, active le token. Utilisé par /check-pool (page du token) et par le cron de rattrapage.
 */
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { getXStockMint } from "@/lib/solana/xstocks";

const BLOWFISH_SAFE = new Set([
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1Rd3",
  "SysvarRent111111111111111111111111111111111",
  "ComputeBudget111111111111111111111111111111",
]);

export async function findPoolOnChain(
  connection: Connection,
  mintAddress: string,
  dbcProgramId: PublicKey,
  xStockConfigAddress?: string | null,  // dbc_config_address (xStock only)
  xStockSymbol?: string | null,          // stock_symbol (xStock only)
): Promise<string | null> {
  const baseMint  = new PublicKey(mintAddress);
  const solConfigs = [process.env.DBC_CONFIG_KEY, process.env.DBC_CONFIG_KEY_LOW].filter(Boolean).map((k) => new PublicKey(k as string));

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
  tx_base64: string | null;
  is_scheduled: boolean | null;
  stock_symbol: string | null;
  dbc_config_address: string | null;
};

/** Renvoie l'adresse de la pool trouvée (et active le token), ou null si elle n'existe pas (encore). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function activateIfPoolExists(admin: any, token: PendingToken): Promise<string | null> {
  if (!token.mint_address) return null;
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) return null;
  const connection = new Connection(rpc, "confirmed");

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
  if (!poolAddress) return null;

  const isScheduled = Boolean(token.is_scheduled);
  await admin.from("launchpad_tokens").update({
    status:         "active",
    is_tradeable:   !isScheduled,
    pool_address:   poolAddress,
    tx_base64:      null,
    tx_prepared_at: null,
    vanity_secret_key: null,
    ...(token.stock_symbol ? { dbc_config_secret: null } : {}),
  }).eq("id", token.id).eq("status", "pending");
  return poolAddress;
}
