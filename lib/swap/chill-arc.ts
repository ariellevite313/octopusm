/**
 * « Chill ton sac » sur Arc. Serveur uniquement.
 * Arc n'est pas un réseau 0x : les achats et ventes passent par le routeur Uniswap V4 d'OM. Le frais OM est la part « plateforme »
 * des plans de frais d'Arc (0,5 % du montant en USDC) ; le détenteur du post en reçoit 40 %, cumulés dans chill_rewards.
 */
import { createPublicClient, decodeFunctionData, http, parseAbi } from "viem";
import { arc } from "@/lib/arc-chain";
import { ARC_DIRECT_ROUTER_ABI, ARC_DIRECT_ROUTER_ADDRESS, ARC_FEE_TIERS } from "@/lib/arc-launchpad";
import { createAdminClient } from "@/lib/supabase/server";

export const ARC_CHILL_FEE_BPS = ARC_FEE_TIERS[0].platformBps; // 0,5 %
/** Frais de pool que le routeur sait viser (les mêmes que l'écran d'achat). */
const FEES = [100, 500, 2500, 3000, 5000, 10000, 15000, 20000, 30000];
const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);

export const arcClient = () => createPublicClient({ chain: arc, transport: http("https://rpc.mainnet.arc.io", { timeout: 10_000 }) });

export type ArcMeta = { name: string; symbol: string; logo: string | null; price: number | null; decimals: number };

/** Nom, symbole, logo (si lancé sur OM) et prix d'un token d'Arc. Le prix vient d'une cotation de vente d'1 token par le routeur. */
export async function arcTokenMeta(token: `0x${string}`): Promise<ArcMeta | null> {
  const c = arcClient();
  try {
    const [decimals, name, symbol] = await Promise.all([
      c.readContract({ address: token, abi: ERC20, functionName: "decimals" }),
      c.readContract({ address: token, abi: ERC20, functionName: "name" }).catch(() => ""),
      c.readContract({ address: token, abi: ERC20, functionName: "symbol" }).catch(() => ""),
    ]);
    const dec = Number(decimals);
    let logo: string | null = null;
    let om: { name?: string; ticker?: string; logo_url?: string | null; price_usd?: number | null } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (createAdminClient() as any).from("launchpad_tokens").select("name, ticker, logo_url, price_usd").eq("chain", "arc").ilike("mint_address", token).limit(1).maybeSingle();
      om = data ?? null;
    } catch { /* base indisponible : on garde les infos de la chaîne */ }
    if (om?.logo_url && /^https:\/\/[^\s"'<>]+$/i.test(om.logo_url)) logo = om.logo_url;
    let price: number | null = om?.price_usd && om.price_usd > 0 ? Number(om.price_usd) : null;
    const router = ARC_DIRECT_ROUTER_ADDRESS;
    if (price == null && router) {
      const one = 10n ** BigInt(dec);
      const quotes = await Promise.all(FEES.map(async (f) => {
        try { const { result } = await c.simulateContract({ address: router, abi: ARC_DIRECT_ROUTER_ABI, functionName: "quoteSell", args: [token, f, one] }); return result as bigint; }
        catch { return 0n; }
      }));
      const best = quotes.reduce((a, b) => (b > a ? b : a), 0n);
      if (best > 0n) price = Number(best) / 1e18; // USDC : 18 décimales côté EVM
    }
    return { name: ((om?.name ?? name) || "").slice(0, 40), symbol: ((om?.ticker ?? symbol) || "").replace(/[^\p{L}\p{N}_.-]/gu, "").slice(0, 16), logo, price, decimals: dec };
  } catch { return null; }
}

/** Solde du détenteur sur la chaîne et sa valeur en $. */
export async function arcHolding(holder: `0x${string}`, token: `0x${string}`) {
  const [bal, meta] = await Promise.all([
    arcClient().readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [holder] }).catch(() => 0n),
    arcTokenMeta(token),
  ]);
  const amount = meta ? Number(bal as bigint) / 10 ** meta.decimals : 0;
  const price = meta?.price ?? null;
  return { amount, price, usd: price != null ? amount * price : null, meta };
}

/**
 * Relit une transaction du routeur : réussie, envoyée par `taker`, vers le routeur d'OM, sur `token`.
 * Renvoie le montant en USDC échangé (18 décimales) : la valeur envoyée pour un achat ; pour une vente, la cotation du routeur
 * au bloc précédent (on ne se fie jamais à un montant donné par le navigateur).
 */
export async function arcTradeUsdc(hash: `0x${string}`, taker: string, token: string): Promise<{ ok: true; usdc: bigint } | { ok: false; error: string; retry?: boolean }> {
  if (!ARC_DIRECT_ROUTER_ADDRESS) return { ok: false, error: "Arc router not configured" };
  const c = arcClient();
  const [tx, rc] = await Promise.all([c.getTransaction({ hash }).catch(() => null), c.getTransactionReceipt({ hash }).catch(() => null)]);
  if (!tx || !rc) return { ok: false, error: "Transaction not found yet", retry: true };
  if (rc.status !== "success") return { ok: false, error: "Transaction failed" };
  if (tx.from.toLowerCase() !== taker.toLowerCase() || (tx.to ?? "").toLowerCase() !== ARC_DIRECT_ROUTER_ADDRESS.toLowerCase()) return { ok: false, error: "Transaction does not match" };
  let call;
  try { call = decodeFunctionData({ abi: ARC_DIRECT_ROUTER_ABI, data: tx.input }); } catch { return { ok: false, error: "Transaction does not match" }; }
  const args = call.args as readonly unknown[];
  if (String(args[0]).toLowerCase() !== token.toLowerCase()) return { ok: false, error: "Transaction does not match" };
  if (call.functionName === "buy") return tx.value > 0n ? { ok: true, usdc: tx.value } : { ok: false, error: "Empty trade" };
  if (call.functionName === "sell") {
    try {
      const { result } = await c.simulateContract({ address: ARC_DIRECT_ROUTER_ADDRESS, abi: ARC_DIRECT_ROUTER_ABI, functionName: "quoteSell", args: [token as `0x${string}`, Number(args[1]), args[2] as bigint], blockNumber: rc.blockNumber - 1n });
      return (result as bigint) > 0n ? { ok: true, usdc: result as bigint } : { ok: false, error: "Empty trade" };
    } catch { return { ok: false, error: "Could not price this sale" }; }
  }
  return { ok: false, error: "Transaction does not match" };
}
