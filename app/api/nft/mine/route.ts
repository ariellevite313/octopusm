/**
 * GET /api/nft/mine : les NFT Solana du compte connecté (API DAS du RPC configuré, côté serveur).
 * Le wallet vient de la session, jamais de la requête. Réservé à Solana.
 */
import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/social/session";

export const dynamic = "force-dynamic";

type Asset = {
  id: string; interface?: string; compression?: { compressed?: boolean };
  content?: { metadata?: { name?: string }; links?: { image?: string }; files?: { uri?: string; cdn_uri?: string }[] };
  grouping?: { group_key: string; group_value: string; collection_metadata?: { name?: string } }[];
};

export async function GET() {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  if (s.wallet.startsWith("0x")) return NextResponse.json({ error: "NFTs are available for Solana wallets only", items: [] }, { status: 400 });
  const rpc = process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!rpc) return NextResponse.json({ error: "NFT reading is not configured", items: [] }, { status: 503 });
  try {
    const res = await fetch(rpc, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAssetsByOwner", params: { ownerAddress: s.wallet, page: 1, limit: 60, displayOptions: { showFungible: false } } }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return NextResponse.json({ error: "NFT reading is not supported by the current RPC", items: [] }, { status: 503 });
    const raw = (j.result?.items ?? []) as Asset[];
    const items = raw
      .filter((a) => a.interface === "V1_NFT" || a.interface === "ProgrammableNFT" || a.interface === "MplCoreAsset")
      .map((a) => ({
        mint: a.id,
        name: String(a.content?.metadata?.name ?? "NFT").slice(0, 60),
        image: a.content?.files?.[0]?.cdn_uri ?? a.content?.links?.image ?? a.content?.files?.[0]?.uri ?? null,
        collection: a.grouping?.find((g) => g.group_key === "collection")?.group_value ?? null,
        compressed: !!a.compression?.compressed,
      }));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Could not read your NFTs right now", items: [] }, { status: 503 });
  }
}
