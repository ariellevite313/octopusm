/**
 * GET /api/terminal/links?mint=…  (Solana)
 * Liens entre les plus gros holders : qui a financé qui (premier SOL reçu par le wallet). Mis en cache 30 min.
 */
import { NextResponse } from "next/server";
import { linksFrom, type Funding } from "@/lib/wallet-links";

export const revalidate = 1800;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_HOLDERS = 25;

function rpcUrl() {
  return process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}
async function rpc(method: string, params: unknown) {
  const res = await fetch(rpcUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message ?? "rpc error");
  return j.result;
}

type Ix = { program?: string; parsed?: { type?: string; info?: { source?: string; destination?: string; lamports?: number } } };

/** Premier wallet qui a envoyé du SOL à `owner` (sa plus ancienne transaction). null si introuvable. */
async function funderOf(owner: string): Promise<string | null> {
  let oldest: string | null = null;
  // Helius : lecture directe de la plus ancienne transaction
  try {
    const r = await rpc("getTransactionsForAddress", [owner, { sortOrder: "asc", limit: 1, transactionDetails: "signatures" }]) as { data?: { signature: string }[] } | { signature: string }[];
    const l = Array.isArray(r) ? r : r?.data ?? [];
    oldest = l[0]?.signature ?? null;
  } catch { /* RPC sans cette méthode */ }
  if (!oldest) {
    let before: string | undefined;
    for (let p = 0; p < 3; p++) {
      const sg = (await rpc("getSignaturesForAddress", [owner, { limit: 1000, ...(before ? { before } : {}) }])) as { signature: string }[];
      if (!sg.length) break;
      before = sg[sg.length - 1].signature;
      if (sg.length < 1000) { oldest = before; break; }
    }
  }
  if (!oldest) return null;
  const tx = await rpc("getTransaction", [oldest, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]) as { transaction?: { message?: { instructions?: Ix[] } }; meta?: { innerInstructions?: { instructions: Ix[] }[] } } | null;
  const all = [...(tx?.transaction?.message?.instructions ?? []), ...(tx?.meta?.innerInstructions ?? []).flatMap((i) => i.instructions)];
  const t = all.find((i) => i.program === "system" && (i.parsed?.type === "transfer" || i.parsed?.type === "transferWithSeed") && i.parsed.info?.destination === owner && i.parsed.info?.source !== owner);
  return t?.parsed?.info?.source ?? null;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const mint = (u.searchParams.get("mint") ?? "").trim();
  if (!BASE58_RE.test(mint)) return NextResponse.json({ error: "invalid mint" }, { status: 400 });
  const cache = { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } };
  try {
    const hj = await fetch(`${u.origin}/api/launchpad/holders/${mint}`, { signal: AbortSignal.timeout(20000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const top = ((hj?.holders ?? []) as { owner: string; isProgram: boolean }[]).filter((h) => !h.isProgram).slice(0, MAX_HOLDERS);
    const list: Funding[] = await Promise.all(top.map(async (h) => ({ owner: h.owner, funder: await funderOf(h.owner).catch(() => null) })));
    return NextResponse.json({ links: linksFrom(list) }, cache);
  } catch {
    return NextResponse.json({ links: [] }, cache);
  }
}
