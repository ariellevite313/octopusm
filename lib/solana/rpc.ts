/**
 * Accès unique au RPC Solana côté serveur, avec bascule automatique.
 *
 *   SOLANA_RPC_URL            : RPC principal (Helius, QuickNode…)
 *   SOLANA_RPC_URL_FALLBACKS  : RPC de secours, séparés par des virgules (facultatif)
 *
 * Quand un RPC répond « 429 Too Many Requests », une erreur 5xx ou ne répond pas, la même requête
 * part tout de suite vers le RPC suivant, et le RPC saturé est mis de côté 30 secondes.
 * Une seule Connection est gardée par niveau de confirmation (pas une par requête).
 */
import { Connection, type Commitment } from "@solana/web3.js";

const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
const COOLDOWN_MS = 30_000;

function rpcUrls(): string[] {
  const list = [
    process.env.SOLANA_RPC_URL,
    ...(process.env.SOLANA_RPC_URL_FALLBACKS ?? "").split(","),
  ].map((u) => (u ?? "").trim()).filter(Boolean);
  if (!list.includes(PUBLIC_RPC)) list.push(PUBLIC_RPC); // dernier recours
  return [...new Set(list)];
}

const badUntil = new Map<string, number>();

/** fetch qui essaie chaque RPC à tour de rôle (le corps JSON-RPC est une chaîne, réutilisable). */
async function failoverFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urls = rpcUrls();
  const now = Date.now();
  const ordered = [...urls.filter((u) => (badUntil.get(u) ?? 0) <= now), ...urls.filter((u) => (badUntil.get(u) ?? 0) > now)];
  let lastRes: Response | null = null;
  let lastErr: unknown = null;
  for (const url of ordered) {
    try {
      const res = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) });
      if (res.status === 429 || res.status >= 500) {
        badUntil.set(url, Date.now() + COOLDOWN_MS);
        lastRes = res;
        continue;
      }
      return res;
    } catch (e) {
      badUntil.set(url, Date.now() + COOLDOWN_MS);
      lastErr = e;
    }
  }
  if (lastRes) return lastRes;
  throw lastErr ?? new Error(`Solana RPC unreachable (${String(input)})`);
}

const conns = new Map<string, Connection>();

/** Connection Solana partagée, avec bascule sur les RPC de secours. */
export function solanaConnection(commitment: Commitment = "confirmed"): Connection {
  let c = conns.get(commitment);
  if (!c) {
    c = new Connection(rpcUrls()[0], {
      commitment,
      fetch: failoverFetch as typeof fetch,
      disableRetryOnRateLimit: true, // pas d'attente sur un RPC saturé : on passe au suivant
    });
    conns.set(commitment, c);
  }
  return c;
}

/** Vrai si au moins un RPC est configuré (le public seul ne suffit pas pour la production). */
export const solanaRpcConfigured = () => Boolean(process.env.SOLANA_RPC_URL);
