/**
 * GET /api/terminal?list=trending|new|volume|crypto  ou  ?q=…  &chains=solana,base (absent ou « all » : tous les réseaux)
 * (ou &chain=… pour un seul réseau). Tokens pour le Terminal OM.
 */
import { NextResponse } from "next/server";
import { arcList, CHAINS, isSkipped, mergeLists, searchAll, terminalList, type TerminalChain, type TerminalToken } from "@/lib/terminal";
import { jupVerified } from "@/lib/bags";
import { cryptoFromCoinGecko } from "@/lib/terminal-crypto";
import { isMajorEvm, isMajorSolana } from "@/lib/swap/majors";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const READY = CHAINS.filter((c) => c.ready).map((c) => c.id);

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 60);
  const l = u.searchParams.get("list");
  const list = l === "new" ? "new" : l === "volume" ? "volume" : l === "crypto" ? "crypto" : "trending";
  const raw = (u.searchParams.get("chains") ?? u.searchParams.get("chain") ?? "all").split(",").map((s) => s.trim());
  let chains = raw.filter((c): c is TerminalChain => READY.includes(c as TerminalChain));
  if (!chains.length) chains = READY;
  const kind = q.length >= 2 ? "search" : list;
  // Crypto : classement CoinGecko (prix Binance), puis repli sur les pools GeckoTerminal si CoinGecko ne répond pas
  let cgList: TerminalToken[] = [];
  if (kind === "crypto") cgList = await cryptoFromCoinGecko(chains.filter((c) => c !== "arc"), isSkipped).catch(() => []);
  // Recherche sur plusieurs réseaux : un seul appel global (plus Arc depuis notre base)
  const results = cgList.length
    ? [cgList, chains.includes("arc") ? await arcList(createAdminClient(), kind, q).catch(() => [] as TerminalToken[]) : []]
    : kind === "search" && chains.filter((c) => c !== "arc").length > 1
    ? await Promise.all([
        searchAll(q, chains.filter((c) => c !== "arc")).catch(() => [] as TerminalToken[]),
        chains.includes("arc") ? arcList(createAdminClient(), kind, q).catch(() => [] as TerminalToken[]) : Promise.resolve([] as TerminalToken[]),
      ])
    : await Promise.all(chains.map(async (chain): Promise<TerminalToken[]> => {
        try { return chain === "arc" ? await arcList(createAdminClient(), kind, q) : await terminalList(kind, q, chain); } catch { return []; }
      }));
  const tokens = mergeLists(results, kind);
  // Pastille : tokens vérifiés sur Jupiter (Solana), majeurs, ou lancés sur OM (Arc)
  const sol = tokens.filter((t) => (t.chain ?? "solana") === "solana" && !t.href);
  const ver = await jupVerified(sol.map((t) => t.mint)).catch(() => new Set<string>());
  for (const t of tokens) t.verified = t.verified || t.href ? true : (t.chain ?? "solana") === "solana" ? ver.has(t.mint) || isMajorSolana(t.mint) : isMajorEvm(t.chain ?? "", t.mint);
  return NextResponse.json({ tokens }, { status: tokens.length || chains.length === 0 ? 200 : 200, headers: { "Cache-Control": "public, max-age=30" } });
}
