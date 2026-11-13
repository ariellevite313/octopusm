/**
 * « Chill ton sac » sur les réseaux EVM. Serveur uniquement.
 * - holding : solde du détenteur lu sur la chaîne, prix DexScreener.
 * - refToken : jeton signé (HMAC) remis avec le devis ; il prouve que la transaction à enregistrer vient d'un devis
 *   que nous avons émis pour ce post, donc que la part du détenteur est légitime.
 */
import { createHmac, createHash, timingSafeEqual } from "crypto";
import { EVM_CHAINS, type EvmChain } from "./evm";

export const CHILL_EVM_SHARE_BPS = 4000; // 40 % des frais OM
export const DS_EVM: Record<EvmChain, string> = { base: "base", bnb: "bsc", hyperliquid: "hyperevm", ethereum: "ethereum", arbitrum: "arbitrum", polygon: "polygon", avalanche: "avalanche" };

async function rpc<T>(chain: EvmChain, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(EVM_CHAINS[chain].rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000), cache: "no-store" });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message ?? "rpc error");
  return j.result as T;
}
const pad = (a: string) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
export const ethCall = (chain: EvmChain, to: string, data: string) => rpc<string>(chain, "eth_call", [{ to, data }, "latest"]);

type DsPair = { priceUsd?: string; liquidity?: { usd?: number }; baseToken?: { address?: string; name?: string; symbol?: string }; info?: { imageUrl?: string } };

/** Nom, symbole, logo et prix d'un token EVM (pool la plus liquide où le token est la base). */
export async function evmTokenMeta(chain: EvmChain, token: string): Promise<{ name: string; symbol: string; logo: string | null; price: number | null } | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/${DS_EVM[chain]}/${token}`, { signal: AbortSignal.timeout(7000), cache: "no-store" });
    const pairs = ((r.ok ? await r.json() : []) as DsPair[]).filter((p) => (p.baseToken?.address ?? "").toLowerCase() === token.toLowerCase());
    const best = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (!best) return null;
    const logo = best.info?.imageUrl && /^https:\/\/[^\s"'<>]+$/i.test(best.info.imageUrl) ? best.info.imageUrl : null;
    const price = best.priceUsd ? Number(best.priceUsd) : null;
    return { name: (best.baseToken?.name ?? "").slice(0, 40), symbol: (best.baseToken?.symbol ?? "").replace(/[^\p{L}\p{N}_.-]/gu, "").slice(0, 16), logo, price: price && price > 0 ? price : null };
  } catch { return null; }
}

/** Valeur en $ détenue par `holder` pour `token` (solde sur la chaîne × prix). */
export async function evmHolding(chain: EvmChain, holder: string, token: string): Promise<{ amount: number; usd: number | null; price: number | null; meta: Awaited<ReturnType<typeof evmTokenMeta>> }> {
  const [bal, dec, meta] = await Promise.all([
    ethCall(chain, token, "0x70a08231" + pad(holder)).catch(() => "0x0"),
    ethCall(chain, token, "0x313ce567").catch(() => "0x12"),
    evmTokenMeta(chain, token),
  ]);
  const decimals = Number(BigInt(dec && dec !== "0x" ? dec : "0x12"));
  const amount = Number(BigInt(bal && bal !== "0x" ? bal : "0x0")) / 10 ** (Number.isFinite(decimals) ? decimals : 18);
  const price = meta?.price ?? null;
  return { amount, price, usd: price != null ? amount * price : null, meta };
}

function key() { return process.env.CHILL_REF_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev-only"; }
export const dataHash = (data: string) => createHash("sha256").update(data.toLowerCase()).digest("hex");
const payload = (p: { postId: string; chain: string; taker: string; to: string; data: string; feeNative: string; holder: string }) =>
  [p.postId, p.chain, p.taker.toLowerCase(), p.to.toLowerCase(), dataHash(p.data), p.feeNative, p.holder.toLowerCase()].join("|");
export const signRef = (p: Parameters<typeof payload>[0]) => createHmac("sha256", key()).update(payload(p)).digest("hex");
export function verifyRef(p: Parameters<typeof payload>[0], token: string): boolean {
  const a = Buffer.from(signRef(p)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export { refMessage } from "./chill-evm-msg";
