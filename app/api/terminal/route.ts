/**
 * GET /api/terminal?list=trending|new|volume  ou  ?q=…  &chains=solana,base (absent ou « all » : tous les réseaux)
 * (ou &chain=… pour un seul réseau). Tokens pour le Terminal OM.
 */
import { NextResponse } from "next/server";
import { arcList, CHAINS, mergeLists, terminalList, type TerminalChain, type TerminalToken } from "@/lib/terminal";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const READY = CHAINS.filter((c) => c.ready).map((c) => c.id);

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 60);
  const l = u.searchParams.get("list");
  const list = l === "new" ? "new" : l === "volume" ? "volume" : "trending";
  const raw = (u.searchParams.get("chains") ?? u.searchParams.get("chain") ?? "all").split(",").map((s) => s.trim());
  let chains = raw.filter((c): c is TerminalChain => READY.includes(c as TerminalChain));
  if (!chains.length) chains = READY;
  const kind = q.length >= 2 ? "search" : list;
  const results = await Promise.all(chains.map(async (chain): Promise<TerminalToken[]> => {
    try { return chain === "arc" ? await arcList(createAdminClient(), kind, q) : await terminalList(kind, q, chain); } catch { return []; }
  }));
  const tokens = mergeLists(results, kind);
  return NextResponse.json({ tokens }, { status: tokens.length || chains.length === 0 ? 200 : 200, headers: { "Cache-Control": "public, max-age=30" } });
}
