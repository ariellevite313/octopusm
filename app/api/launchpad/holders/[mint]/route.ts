/**
 * GET /api/launchpad/holders/[mint]
 * Top 100 holders d'un token SPL (regroupés par propriétaire), avec le nom OMdotfun quand le holder a un profil.
 */
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { TOP_HOLDERS, withProfiles } from "@/lib/holders";

export const revalidate = 60;

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function rpcUrl() {
  return process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message ?? "rpc error");
  return j.result;
}

export async function GET(_req: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  if (!BASE58_RE.test(mint)) return NextResponse.json({ error: "invalid mint" }, { status: 400 });

  try {
    const supplyRes = await rpc("getTokenSupply", [mint]);
    const decimals: number = supplyRes?.value?.decimals ?? 0;
    const supply = Number(supplyRes?.value?.amount ?? 0);

    const byOwner = new Map<string, bigint>();
    let partial = false;
    try {
      // Liste complète (beaucoup de RPC gratuits refusent cette requête)
      const accounts = await rpc("getProgramAccounts", [TOKEN_PROGRAM, {
        encoding: "base64",
        dataSlice: { offset: 32, length: 40 }, // owner (32) + amount (8)
        filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
      }]);
      for (const a of accounts as { account: { data: [string, string] } }[]) {
        const buf = Buffer.from(a.account.data[0], "base64");
        if (buf.length < 40) continue;
        const owner = new PublicKey(buf.subarray(0, 32)).toBase58();
        const amount = buf.readBigUInt64LE(32);
        if (amount === BigInt(0)) continue;
        byOwner.set(owner, (byOwner.get(owner) ?? BigInt(0)) + amount);
      }
    } catch {
      // Secours léger : les 20 plus gros comptes, puis leur propriétaire
      partial = true;
      const largest = (await rpc("getTokenLargestAccounts", [mint]))?.value as { address: string; amount: string }[] ?? [];
      const infos = (await rpc("getMultipleAccounts", [largest.map((l) => l.address), { encoding: "jsonParsed" }]))?.value as
        ({ data?: { parsed?: { info?: { owner?: string } } } } | null)[] ?? [];
      largest.forEach((l, i) => {
        const owner = infos[i]?.data?.parsed?.info?.owner;
        const amount = BigInt(l.amount);
        if (owner && amount > BigInt(0)) byOwner.set(owner, (byOwner.get(owner) ?? BigInt(0)) + amount);
      });
    }

    const top = [...byOwner.entries()]
      .sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0))
      .slice(0, TOP_HOLDERS)
      .map(([owner, amt], i) => {
        let isProgram = false;
        try { isProgram = !PublicKey.isOnCurve(new PublicKey(owner).toBytes()); } catch { /* ignore */ }
        return {
          rank: i + 1,
          owner,
          amount: Number(amt) / 10 ** decimals,
          pct: supply > 0 ? (Number(amt) / supply) * 100 : 0,
          isProgram,
        };
      });

    const holders = await withProfiles(createAdminClient(), top);
    return NextResponse.json({ holders, total: byOwner.size, partial }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
