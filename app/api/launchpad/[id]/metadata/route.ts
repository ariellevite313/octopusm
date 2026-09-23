/**
 * GET /api/launchpad/[id]/metadata
 *
 * Serves Metaplex-compatible metadata JSON for a launchpad token.
 * Used as the on-chain metadataUri so Phantom, Jupiter, DexScreener… can
 * display the token name, symbol, and logo.
 *
 * Image is served via our own /api/launchpad/[id]/image proxy so the logo
 * is always accessible regardless of Supabase bucket visibility settings.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token } = await admin
      .from("launchpad_tokens")
      .select("name, ticker, description, logo_url, creator_wallet, website, twitter, telegram")
      .eq("id", id)
      .maybeSingle();

    if (!token) {
      return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
    }

    // Use our own image proxy so Phantom can always access the logo —
    // even when the Supabase storage bucket is not set to "public".
    const origin = new URL(req.url).origin;
    const imageUrl = `${origin}/api/launchpad/${id}/image`;

    // Detect MIME type from the stored URL extension (for properties.files)
    const ext = (token.logo_url as string | null)?.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "";
    const mimeType =
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      ext === "gif"  ? "image/gif"  :
      ext === "webp" ? "image/webp" :
                       "image/png";

    const metadata = {
      name:         token.name,
      symbol:       token.ticker,
      description:  token.description ?? "",
      image:        imageUrl,
      external_url: token.website ?? "",
      attributes:   [],
      // Metaplex-standard creators — read by Solscan, Jupiter, Magic Eden, etc.
      ...(token.creator_wallet
        ? { creators: [{ address: token.creator_wallet, share: 100, verified: false }] }
        : {}),
      properties: {
        files:    [{ uri: imageUrl, type: mimeType }],
        category: "image",
        ...(token.creator_wallet
          ? { creators: [{ address: token.creator_wallet, share: 100 }] }
          : {}),
      },
      extensions: {
        website:  token.website  ?? null,
        twitter:  token.twitter  ?? null,
        telegram: token.telegram ?? null,
      },
    };

    return NextResponse.json(metadata, {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, max-age=60, stale-while-revalidate=30",
      },
    });
  } catch (err) {
    console.error("[metadata] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
}
