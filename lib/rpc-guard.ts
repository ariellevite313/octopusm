/**
 * Protection des proxys RPC (/api/solana/rpc, /api/arc-rpc) : sans elle, n'importe qui pouvait s'en servir
 * comme relais gratuit et consommer la clé RPC. Contrôles : site d'origine, taille, méthodes autorisées,
 * nombre de sous-requêtes et limite par IP.
 */
import { hit } from "@/lib/v1/launch";
import { getIp } from "@/lib/v1/helpers";

/** Méthodes Solana réellement utilisées par le site (lecture, simulation, envoi). Pas de getProgramAccounts ni getBlock. */
export const SOLANA_METHODS = new Set([
  "getLatestBlockhash", "getRecentBlockhash", "isBlockhashValid", "getBlockHeight", "getSlot", "getEpochInfo", "getVersion", "getHealth",
  "getBalance", "getAccountInfo", "getMultipleAccounts", "getTokenAccountBalance", "getTokenAccountsByOwner", "getTokenSupply",
  "getMinimumBalanceForRentExemption", "getFeeForMessage", "getRecentPrioritizationFees", "getBlockTime",
  "getSignatureStatuses", "getSignaturesForAddress", "getTransaction", "simulateTransaction", "sendTransaction",
]);

/** Méthodes EVM utilisées pour lire Arc et suivre une transaction (l'envoi signé passe par le portefeuille). */
export const ARC_METHODS = new Set([
  "eth_chainId", "net_version", "eth_blockNumber", "eth_getBlockByNumber", "eth_call", "eth_getBalance", "eth_getCode",
  "eth_getTransactionCount", "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getLogs", "eth_estimateGas",
  "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_sendRawTransaction",
]);

/** IP du client : « x-real-ip » (posé par le serveur web) avant « x-forwarded-for », que le client peut falsifier. */
const clientIp = (req: Request) => req.headers.get("x-real-ip") ?? getIp(req);

export const MAX_BODY_BYTES = 24_000;
export const MAX_BATCH = 20;

type RpcMsg = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };
export type GuardResult = { ok: true; body: unknown } | { ok: false; response: Response };

const refuse = (status: number, code: number, message: string, id: unknown = null): GuardResult => ({
  ok: false,
  response: Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status }),
});

/**
 * Le navigateur envoie « Origin » : s'il vient d'un autre site que le nôtre, on refuse. Les appels serveur n'en ont pas.
 * Hôtes acceptés : celui de la requête (selon la config du serveur web), l'hôte transmis, et l'adresse officielle du site.
 */
function sameSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const o = new URL(origin).host.toLowerCase();
    const allowed = new Set<string>();
    for (const h of [req.headers.get("host"), req.headers.get("x-forwarded-host"), new URL(req.url).host]) if (h) allowed.add(h.split(",")[0].trim().toLowerCase());
    try { allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://omdot.fun").host.toLowerCase()); } catch { /* ignoré */ }
    return allowed.has(o) || allowed.has(o.replace(/^www\./, "")) || allowed.has(`www.${o}`);
  } catch { return false; }
}

export async function guardRpc(req: Request, opts: { name: string; methods: Set<string>; perMinute: number }): Promise<GuardResult> {
  if (!sameSite(req)) return refuse(403, -32600, "Forbidden origin");
  if (!hit(`rpc:${opts.name}:${clientIp(req)}`, opts.perMinute, 60_000)) return refuse(429, -32005, "Too many requests, slow down");

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) return refuse(413, -32600, "Request too large");
  const text = await req.text().catch(() => "");
  if (!text || text.length > MAX_BODY_BYTES) return refuse(text ? 413 : 400, -32600, text ? "Request too large" : "Empty request");

  let body: unknown;
  try { body = JSON.parse(text); } catch { return refuse(400, -32700, "Invalid JSON"); }

  const msgs: RpcMsg[] = Array.isArray(body) ? (body as RpcMsg[]) : [body as RpcMsg];
  if (!msgs.length || msgs.length > MAX_BATCH) return refuse(400, -32600, "Invalid batch size");
  for (const m of msgs) {
    if (!m || typeof m !== "object" || typeof m.method !== "string") return refuse(400, -32600, "Invalid request");
    if (!opts.methods.has(m.method)) return refuse(403, -32601, "Method not allowed", m.id ?? null);
  }
  return { ok: true, body };
}
