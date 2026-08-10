/**
 * GET /api/launchpad/[id]/metadata
 *
 * Serves Metaplex-compatible metadata JSON for a launchpad token.
 * Used as the on-chain metadataUri when R2/Arweave upload is not yet set up.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: token } = await admin
    .from("launchpad_tokens")
    .select("name, ticker, description, logo_url, website, twitter, telegram")
    .eq("id", id)
    .maybeSingle();

  if (!token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const metadata = {
    name:         token.name,
    symbol:       token.ticker,
    description:  token.description ?? "",
    image:        token.logo_url ?? "https://omdot.fun/octomarket-logo.png",
    external_url: token.website ?? "",
    attributes:   [],
    properties: {
      files:    [{ uri: token.logo_url ?? "", type: "image/png" }],
      category: "image",
    },
    extensions: {
      website:  token.website  ?? null,
      twitter:  token.twitter  ?? null,
      telegram: token.telegram ?? null,
    },
  };

  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
    },
  });
}
