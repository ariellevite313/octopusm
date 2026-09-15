/**
 * POST /api/launchpad/[id]/prepare-tx
 *
 * SOL meme token path (stock_symbol = null):
 *   Returns { txABase64, txBBase64, mintAddress }
 *   TX A — mint creation + metadata + platform fee  (no Phantom warning)
 *   TX B — Meteora DBC pool creation                ("Proceed anyway" in Phantom)
 *
 * xStock-paired path (stock_symbol set, e.g. "xNVDA"):
 *   Returns { txABase64, txBBase64, txCBase64, mintAddress, configAddress }
 *   TX A — platform fee only (Blowfish-safe)
 *   TX B — DBC createConfig (fresh keypair, quoteMint = xStock)
 *   TX C — DBC createPool (creates meme mint + metadata + pool + vaults)
 *
 * On-chain mint check always runs BEFORE the cache so a retry after TX A confirmed
 * (but TX B was cancelled) never asks the user to pay again.
 *
 * For xStock retries where TX B (createConfig) already landed on-chain:
 *   Returns { txABase64: null, txBBase64: null, txCBase64, mintAddress, configAddress }
 *   The caller skips TX A+B and only presents TX C to the user.
 */
import { NextResponse } from "next/server";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import {
  buildSplitPoolTransactions,
  buildStockPairedTransactions,
  buildMetadataJson,
} from "@/lib/solana/dbc";

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
      .select(
        "id,creator_wallet,status,name,ticker,description,logo_url,website,twitter,telegram," +
        "supply,first_buy_amount,is_scheduled,mint_address,vanity_secret_key,metadata_uri," +
        "tx_base64,tx_prepared_at,stock_symbol,dbc_config_secret,dbc_config_address"
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    if (token.creator_wallet !== body.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (token.status !== "pending") {
      return NextResponse.json({ error: `Token is already ${token.status as string}` }, { status: 409 });
    }

    const isXStock = Boolean(token.stock_symbol);

    // ── Mint keypair ─────────────────────────────────────────────────────────
    let mintKeypair: Keypair;
    if (token.vanity_secret_key) {
      const secretBytes = Uint8Array.from(Buffer.from(token.vanity_secret_key as string, "base64"));
      if (secretBytes.length !== 64) {
        return NextResponse.json(
          { error: "Keypair corrompu. Supprime ce token et relance la création." },
          { status: 422 }
        );
      }
      mintKeypair = Keypair.fromSecretKey(secretBytes);
    } else {
      mintKeypair = Keypair.generate();
      const mintSecret  = Buffer.from(mintKeypair.secretKey).toString("base64");
      const mintAddress = mintKeypair.publicKey.toBase58();
      await admin.from("launchpad_tokens")
        .update({ mint_address: mintAddress, vanity_secret_key: mintSecret })
        .eq("id", id);
    }

    const metadataUri = (token.metadata_uri as string | null)
      ?? `https://omdot.fun/api/launchpad/${id}/metadata`;

    const dbcParams = {
      name:          token.name as string,
      symbol:        token.ticker as string,
      metadataUri,
      creatorWallet: token.creator_wallet as string,
      mintKeypair,
      totalSupply:   token.supply as number,
      firstBuySol:   (token.first_buy_amount as number) ?? 0,
      isScheduled:   Boolean(token.is_scheduled),
      stockSymbol:   (token.stock_symbol as string | null) ?? null,
    };

    // ── xStock: check if DBC config already on-chain (retry where TX B landed) ─
    if (isXStock && token.dbc_config_address) {
      try {
        const rpc = process.env.SOLANA_RPC_URL;
        if (rpc) {
          const conn = new Connection(rpc, "confirmed");
          const configInfo = await conn.getAccountInfo(new PublicKey(token.dbc_config_address as string));
          if (configInfo !== null) {
            console.log("[prepare-tx xStock] config already on-chain — returning TX C only");

            // Rebuild TX C only from fresh DB config secret (mintKeypair already known)
            const configSecretB64 = token.dbc_config_secret as string | null;
            if (!configSecretB64) {
              console.error("[prepare-tx xStock] dbc_config_secret missing — cannot rebuild TX C");
              return NextResponse.json(
                { error: "DBC config secret missing in DB — cannot rebuild pool transaction. Contact support." },
                { status: 500 }
              );
            }
            const configKeypairOverride = Keypair.fromSecretKey(
              Uint8Array.from(Buffer.from(configSecretB64, "base64"))
            );

            const { txCBase64 } = await buildStockPairedTransactions(dbcParams, configKeypairOverride);

            // Cache the fresh TX C
            await admin.from("launchpad_tokens")
              .update({
                tx_base64:      JSON.stringify({ a: null, b: null, c: txCBase64 }),
                tx_prepared_at: new Date().toISOString(),
              })
              .eq("id", id);

            return NextResponse.json({
              txABase64:     null,
              txBBase64:     null,
              txCBase64,
              mintAddress:   mintKeypair.publicKey.toBase58(),
              configAddress: token.dbc_config_address,
            });
          }
        }
      } catch (e) {
        console.warn("[prepare-tx xStock] config on-chain check failed:", e);
      }
    }

    // ── SOL path: check if mint already on-chain (retry where TX A landed) ────
    if (!isXStock && token.mint_address) {
      try {
        const rpc = process.env.SOLANA_RPC_URL;
        if (rpc) {
          const conn = new Connection(rpc, "confirmed");
          const info = await conn.getAccountInfo(new PublicKey(token.mint_address as string));
          if (info !== null) {
            console.log("[prepare-tx] mint already on-chain — rebuilding TX B with fresh blockhash");

            if (token.tx_base64) {
              try {
                const cached = JSON.parse(token.tx_base64 as string) as { a?: string; b?: string };
                if (cached.b) {
                  const { Transaction: Tx } = await import("@solana/web3.js");
                  const cachedTxB = Tx.from(Buffer.from(cached.b, "base64"));
                  const { blockhash } = await conn.getLatestBlockhash("confirmed");
                  const creator      = new PublicKey(body.walletAddress!);
                  const freshTxB     = new Tx({ recentBlockhash: blockhash, feePayer: creator });
                  for (const ix of cachedTxB.instructions) freshTxB.add(ix);
                  const mintStr = mintKeypair.publicKey.toBase58();
                  if (freshTxB.signatures.some((s: { publicKey: PublicKey }) => s.publicKey.toBase58() === mintStr)) {
                    freshTxB.partialSign(mintKeypair);
                  }
                  const txBBase64 = Buffer.from(freshTxB.serialize({ requireAllSignatures: false })).toString("base64");
                  await admin.from("launchpad_tokens")
                    .update({
                      tx_base64:      JSON.stringify({ a: null, b: txBBase64 }),
                      tx_prepared_at: new Date().toISOString(),
                    })
                    .eq("id", id);
                  return NextResponse.json({ txABase64: null, txBBase64, mintAddress: token.mint_address });
                }
              } catch (cacheErr) {
                console.warn("[prepare-tx] cached TX B rebuild failed:", cacheErr);
              }
            }
          }
        }
      } catch (e) {
        console.warn("[prepare-tx] on-chain mint check failed:", e);
      }
    }

    // ── Cache check (only when not yet on-chain) ──────────────────────────────
    const cachedAt   = token.tx_prepared_at ? new Date(token.tx_prepared_at as string).getTime() : 0;
    const cacheAgeMs = Date.now() - cachedAt;
    if (token.tx_base64 && cacheAgeMs < 45_000) {
      try {
        const parsed = JSON.parse(token.tx_base64 as string) as {
          a?: string | null;
          b?: string | null;
          c?: string | null;
        };
        if (parsed.a && parsed.b) {
          return NextResponse.json({
            txABase64:    parsed.a,
            txBBase64:    parsed.b,
            txCBase64:    parsed.c ?? undefined,
            mintAddress:  token.mint_address,
            ...(token.dbc_config_address ? { configAddress: token.dbc_config_address } : {}),
          });
        }
      } catch { /* legacy cache — fall through */ }
    }

    // ── Build metadata ────────────────────────────────────────────────────────
    buildMetadataJson({
      name:          token.name as string,
      symbol:        token.ticker as string,
      description:   (token.description as string) ?? "",
      logoUrl:       (token.logo_url as string) ?? "https://omdot.fun/octomarket-logo.png",
      creatorWallet: token.creator_wallet as string,
      website:       token.website as string | undefined,
      twitter:       token.twitter as string | undefined,
      telegram:      token.telegram as string | undefined,
    });

    // ── Build split transactions ──────────────────────────────────────────────
    const result = await buildSplitPoolTransactions(dbcParams);
    const { txABase64, txBBase64, mintAddress } = result;
    const txCBase64          = result.txCBase64;
    const configAddress      = result.configAddress;
    const configKeypairSecret = result.configKeypairSecret;

    // Persist to DB
    const updatePayload: Record<string, string | null> = {
      metadata_uri:   metadataUri,
      tx_base64:      JSON.stringify({ a: txABase64, b: txBBase64, c: txCBase64 ?? null }),
      tx_prepared_at: new Date().toISOString(),
    };
    if (configAddress)       updatePayload.dbc_config_address = configAddress;
    if (configKeypairSecret) updatePayload.dbc_config_secret  = configKeypairSecret;

    await admin.from("launchpad_tokens").update(updatePayload).eq("id", id);

    return NextResponse.json({
      txABase64,
      txBBase64,
      ...(txCBase64    ? { txCBase64 }    : {}),
      mintAddress,
      ...(configAddress ? { configAddress } : {}),
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("prepare-tx error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
