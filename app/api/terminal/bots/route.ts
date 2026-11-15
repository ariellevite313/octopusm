/**
 * GET /api/terminal/bots?mint=…  (Solana)
 * Robots probables parmi les plus gros holders : snipers et rythmes de machine. Estimation mise en cache 10 min.
 * Les wallets d'IA d'OM (connexions MCP) et le créateur du token sont exclus.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { classify, summarizeBots, type BotHit } from "@/lib/bots";

export const revalidate = 600;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_HOLDERS = 25;

function rpcUrl() {
  return process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}
async function rpc(method: string, params: unknown[]) {
  const res = await fetch(rpcUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message ?? "rpc error");
  return j.result;
}

/** Ouverture du marché : création de la plus ancienne paire connue sur DexScreener (secondes). */
async function openedAt(mint: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, { signal: AbortSignal.timeout(6000) });
    const j = (r.ok ? await r.json() : []) as { pairCreatedAt?: number }[];
    const ts = j.map((p) => p.pairCreatedAt ?? 0).filter((x) => x > 0);
    return ts.length ? Math.floor(Math.min(...ts) / 1000) : null;
  } catch { return null; }
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const mint = (u.searchParams.get("mint") ?? "").trim();
  if (!BASE58_RE.test(mint)) return NextResponse.json({ error: "invalid mint" }, { status: 400 });
  const none = { available: false, wallets: [] as BotHit[], pct: 0 };
  const cache = { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const [hj, opened, ai, tok] = await Promise.all([
      fetch(`${u.origin}/api/launchpad/holders/${mint}`, { signal: AbortSignal.timeout(20000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      openedAt(mint),
      db.from("agent_wallets").select("sol_address").limit(5000),
      db.from("launchpad_tokens").select("creator_wallet, created_at").eq("mint_address", mint).maybeSingle(),
    ]);
    // Pas de date sur DexScreener (pool tout neuf, paires DOGE / PEPE) : date du lancement sur OM
    const openTs = opened ?? (tok?.data?.created_at ? Math.floor(new Date(tok.data.created_at).getTime() / 1000) : null);
    const exclude = new Set<string>(((ai?.data ?? []) as { sol_address: string }[]).map((w) => w.sol_address));
    if (tok?.data?.creator_wallet) exclude.add(tok.data.creator_wallet);
    const top = ((hj?.holders ?? []) as { owner: string; pct: number; isProgram: boolean }[])
      .filter((h) => !h.isProgram && !exclude.has(h.owner)).slice(0, MAX_HOLDERS);
    if (!top.length) return NextResponse.json(none, cache);

    const hits = (await Promise.all(top.map(async (h): Promise<BotHit | null> => {
      try {
        const accs = (await rpc("getTokenAccountsByOwner", [h.owner, { mint }, { encoding: "jsonParsed" }])) as { value?: { pubkey: string }[] };
        const acc = accs?.value?.[0]?.pubkey;
        if (!acc) return null;
        const sg = (await rpc("getSignaturesForAddress", [acc, { limit: 200 }])) as { blockTime?: number | null }[];
        const kind = classify(sg.map((s) => s.blockTime ?? 0), openTs);
        return kind ? { owner: h.owner, kind, pct: h.pct } : null;
      } catch { return null; }
    }))).filter(Boolean) as BotHit[];

    const r = summarizeBots(hits, exclude);
    return NextResponse.json({ available: true, wallets: r.wallets, pct: r.pct }, cache);
  } catch {
    return NextResponse.json(none, cache);
  }
}
