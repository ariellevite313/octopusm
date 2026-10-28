/**
 * GET /api/launchpad/bundle/[mint]
 * Détecte les achats groupés au lancement : portefeuilles qui ont acheté dans les tout premiers blocs
 * (hors créateur) et part du supply qu'ils détiennent encore.
 * Réponse : { available, wallets, pct } — available=false si l'historique est trop long ou illisible.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { detectBundle, type EarlyTx } from "@/lib/holders-analysis";

export const revalidate = 300;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_PAGES = 5;   // 5 × 1000 signatures remontées au maximum
const MAX_EARLY = 40;  // transactions du début analysées au maximum

function rpcUrl() {
  return process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}
async function rpc(method: string, params: unknown[]) {
  const res = await fetch(rpcUrl(), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message ?? "rpc error");
  return j.result;
}

export async function GET(req: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  if (!BASE58_RE.test(mint)) return NextResponse.json({ error: "invalid mint" }, { status: 400 });
  const none = { available: false, wallets: [] as string[], pct: 0 };
  const cache = { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: tok } = await admin.from("launchpad_tokens").select("creator_wallet").eq("mint_address", mint).maybeSingle();
    const creator: string | null = tok?.creator_wallet ?? null;

    // Remonte jusqu'aux toute premières transactions du mint
    let before: string | undefined;
    let oldest: { signature: string; slot: number; err: unknown }[] = [];
    let reachedStart = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const sigs = (await rpc("getSignaturesForAddress", [mint, { limit: 1000, ...(before ? { before } : {}) }])) as typeof oldest;
      if (!sigs.length) { reachedStart = true; break; }
      oldest = sigs;
      before = sigs[sigs.length - 1].signature;
      if (sigs.length < 1000) { reachedStart = true; break; }
    }
    if (!reachedStart || !oldest.length) return NextResponse.json(none, cache);

    // Les plus anciennes d'abord ; on garde celles des premiers blocs
    const chrono = [...oldest].reverse();
    const firstSlot = chrono[0].slot;
    const early = chrono.filter((s) => s.slot <= firstSlot + 3).slice(0, MAX_EARLY);
    const txs: EarlyTx[] = (await Promise.all(early.map(async (s) => {
      try {
        const t = await rpc("getTransaction", [s.signature, { encoding: "json", maxSupportedTransactionVersion: 0 }]);
        const signer: string | undefined = t?.transaction?.message?.accountKeys?.[0];
        return signer ? { slot: s.slot, signer, ok: !s.err } : null;
      } catch { return null; }
    }))).filter(Boolean) as EarlyTx[];

    // Part du supply encore détenue par ces portefeuilles (via l'API holders, déjà en cache)
    const origin = new URL(req.url).origin;
    const hj = await fetch(`${origin}/api/launchpad/holders/${mint}`, { signal: AbortSignal.timeout(20000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const balances = new Map<string, number>((hj?.holders ?? []).map((h: { owner: string; pct: number }) => [h.owner, h.pct]));
    const { wallets, pct } = detectBundle(txs, creator, balances);
    return NextResponse.json({ available: true, wallets, pct }, cache);
  } catch {
    return NextResponse.json(none, cache);
  }
}
