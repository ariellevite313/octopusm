/**
 * Vérifie, sur la chaîne, qui a vraiment créé un token. Le serveur ne croit
 * jamais le wallet envoyé par le client : il compare avec le contrat (Arc) ou
 * avec la pool Meteora DBC (Solana).
 *
 * Résultat :
 *  - "ok"         : le créateur et le token correspondent à la chaîne
 *  - "mismatch"   : la chaîne dit autre chose (tentative de triche ou erreur)
 *  - "unverified" : impossible de lire la chaîne maintenant (RPC, donnée manquante)
 */
export type CreatorVerdict = "ok" | "mismatch" | "unverified";

export type ArcCurveRecord = { token: string; curve: string; creator: string } | null;
export type SolanaPoolRecord = { creator: string; baseMint: string } | null;

const ZERO_EVM = "0x0000000000000000000000000000000000000000";

const sameEvm = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Pur : compare l'enregistrement du contrat Arc avec ce que le client déclare. */
export function judgeArcCreator(
  record: ArcCurveRecord,
  claim: { tokenAddress: string; creatorWallet: string },
): CreatorVerdict {
  if (!record) return "unverified";
  if (!record.token || sameEvm(record.token, ZERO_EVM)) return "mismatch"; // pas une courbe de la factory
  if (!sameEvm(record.token, claim.tokenAddress)) return "mismatch";
  if (!sameEvm(record.creator, claim.creatorWallet)) return "mismatch";
  return "ok";
}

/** Pur : compare la pool DBC (créateur + mint) avec ce que le client déclare. */
export function judgeSolanaCreator(
  pool: SolanaPoolRecord,
  claim: { mintAddress: string; creatorWallet: string },
): CreatorVerdict {
  if (!pool) return "unverified";
  if (pool.baseMint !== claim.mintAddress) return "mismatch";
  if (pool.creator !== claim.creatorWallet) return "mismatch";
  return "ok";
}

export type VerifyDeps = {
  readArcRecord?: (curve: string) => Promise<ArcCurveRecord>;
  readSolanaPool?: (poolAddress: string) => Promise<SolanaPoolRecord>;
};

export type TokenForVerify = {
  chain?: string | null;
  mint_address?: string | null;
  arc_launch_id?: string | null;
  pool_address?: string | null;
  creator_wallet?: string | null;
};

/** Lit la factory Arc : curveRecord(curve) → token, creator. */
export async function readArcRecordOnChain(curve: string): Promise<ArcCurveRecord> {
  try {
    const [{ createPublicClient, http }, { arc }, { ARC_FACTORY_V2_ADDRESS, LAUNCHPAD_FACTORY_V2_ABI, ARC_FACTORY_DIRECT_ADDRESS, ARC_DIRECT_FACTORY_ABI }] =
      await Promise.all([import("viem"), import("@/lib/arc-chain"), import("@/lib/arc-launchpad")]);
    const client = createPublicClient({ chain: arc, transport: http("https://rpc.mainnet.arc.io") });
    // Lancement direct Uniswap V4 : arc_launch_id = adresse du vault
    if (ARC_FACTORY_DIRECT_ADDRESS) {
      const d = (await client.readContract({
        address: ARC_FACTORY_DIRECT_ADDRESS,
        abi: ARC_DIRECT_FACTORY_ABI,
        functionName: "vaultRecord",
        args: [curve as `0x${string}`],
      }).catch(() => null)) as readonly [string, string, string] | null;
      if (d && d[0] && !/^0x0{40}$/i.test(d[0])) return { token: d[0], curve: d[1], creator: d[2] };
    }
    const r = (await client.readContract({
      address: ARC_FACTORY_V2_ADDRESS,
      abi: LAUNCHPAD_FACTORY_V2_ABI,
      functionName: "curveRecord",
      args: [curve as `0x${string}`],
    })) as readonly [string, string, string, string, boolean];
    return { token: r[0], curve: r[1], creator: r[3] };
  } catch {
    return null;
  }
}

/** Lit la pool Meteora DBC : créateur et mint de base. */
export async function readSolanaPoolOnChain(poolAddress: string): Promise<SolanaPoolRecord> {
  try {
    const rpc = process.env.SOLANA_RPC_URL;
    if (!rpc) return null;
    const [{ Connection, PublicKey }, sdk] = await Promise.all([
      import("@solana/web3.js"),
      import("@meteora-ag/dynamic-bonding-curve-sdk"),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Client = (sdk as any).DynamicBondingCurveClient;
    const client = new Client(new Connection(rpc, "confirmed"), "confirmed");
    const pool = await client.state.getPool(new PublicKey(poolAddress));
    if (!pool) return null;
    return { creator: String(pool.creator.toBase58()), baseMint: String(pool.baseMint.toBase58()) };
  } catch {
    return null;
  }
}

/** Point d'entrée : vérifie un token déjà enregistré (Solana ou Arc). */
export async function verifyTokenCreator(token: TokenForVerify, deps: VerifyDeps = {}): Promise<CreatorVerdict> {
  const creator = token.creator_wallet ?? "";
  if (!creator) return "unverified";

  if (token.chain === "arc") {
    if (!token.arc_launch_id || !token.mint_address) return "unverified";
    const record = await (deps.readArcRecord ?? readArcRecordOnChain)(token.arc_launch_id);
    return judgeArcCreator(record, { tokenAddress: token.mint_address, creatorWallet: creator });
  }

  if (!token.pool_address || !token.mint_address) return "unverified";
  const pool = await (deps.readSolanaPool ?? readSolanaPoolOnChain)(token.pool_address);
  return judgeSolanaCreator(pool, { mintAddress: token.mint_address, creatorWallet: creator });
}
