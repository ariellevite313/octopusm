/**
 * POST /api/launchpad/[id]/prepare-tx
 *
 * Builds the DBC pool creation transaction and returns it base64-encoded
 * for the client wallet to sign. The mint keypair (vanity address) is
 * pre-signed server-side.
 *
 * The client must:
 *  1. Deserialize the transaction
 *  2. Sign it with their wallet
 *  3. Send it to the network
 *  4. Call POST /api/launchpad/[id]/confirm with the tx signature
 *
 * Body: { walletAddress: string }
 */
import { NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { buildCreatePoolTransaction, buildMetadataJson } from "@/lib/solana/dbc";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const body = await req.json() as { walletAddress?: string };
    if (!body.walletAddress) {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token, error } = await admin
      .from("launchpad_tokens")
      // Select only the columns needed server-side (vanity_secret_key required to rebuild mint keypair)
      .select("id,creator_wallet,status,name,ticker,description,logo_url,website,twitter,telegram,supply,first_buy_amount,is_scheduled,mint_address,vanity_secret_key,metadata_uri,tx_base64,tx_prepared_at")
      .eq("id", id)
      .maybeSingle();

    if (error || !token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    if (token.creator_wallet !== body.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (token.status !== "pending") {
      return NextResponse.json(
        { error: `Token is already ${token.status as string}` },
        { status: 409 }
      );
    }

    // If a prepared transaction is already cached, return it to avoid
    // duplicate createPool submissions and race conditions.
    // The cached tx expires after 45s (Solana blockhash valid ~60s).
    const cachedAt   = token.tx_prepared_at ? new Date(token.tx_prepared_at as string).getTime() : 0;
    const cacheAgeMs = Date.now() - cachedAt;
    if (token.tx_base64 && cacheAgeMs < 45_000) {
      return NextResponse.json({
        transactionBase64: token.tx_base64,
        mintAddress:       token.mint_address,
      });
    }

    // Mint keypair must be set
    if (!token.mint_address || !token.vanity_secret_key) {
      return NextResponse.json(
        { error: "Mint keypair not ready. Please try again." },
        { status: 202 }
      );
    }

    // Reconstruct mint keypair from stored secret (base64-encoded, 64 bytes)
    const secretBytes = Uint8Array.from(Buffer.from(token.vanity_secret_key as string, "base64"));
    if (secretBytes.length !== 64) {
      return NextResponse.json(
        { error: "Ce token a été créé avec une ancienne version et doit être recréé. Supprime-le et relance la création." },
        { status: 422 }
      );
    }
    const mintKeypair = Keypair.fromSecretKey(secretBytes);

    // Build metadata JSON — logo_url may be null if R2 upload is pending
    const metadataJson = buildMetadataJson({
      name:        token.name as string,
      symbol:      token.ticker as string,
      description: (token.description as string) ?? "",
      logoUrl:     (token.logo_url as string) ?? "https://omdot.fun/octomarket-logo.png",
      website:     token.website as string | undefined,
      twitter:     token.twitter as string | undefined,
      telegram:    token.telegram as string | undefined,
    });

    // For now store metadata JSON directly; in production upload to R2 first
    // TODO: upload metadataJson to R2 and use the returned URL
    const metadataUri = (token.metadata_uri as string | null)
      ?? `https://omdot.fun/api/launchpad/${id}/metadata`;

    // Build the DBC transaction
    const { transactionBase64, mintAddress } = await buildCreatePoolTransaction({
      name:          token.name as string,
      symbol:        token.ticker as string,
      metadataUri,
      creatorWallet: token.creator_wallet as string,
      mintKeypair,
      totalSupply:   token.supply as number,

      firstBuySol:   (token.first_buy_amount as number) ?? 0,
      isScheduled:   Boolean(token.is_scheduled),
      // activationTimestamp is not forwarded — scheduling is app-level only
      // (is_tradeable=false until cron flips it at scheduled_at).
    });

    // Cache the prepared tx in DB to prevent duplicate createPool submissions
    await admin
      .from("launchpad_tokens")
      .update({
        metadata_uri:   metadataUri,
        tx_base64:      transactionBase64,
        tx_prepared_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({
      transactionBase64,
      mintAddress,
      metadataJson,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("prepare-tx error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
