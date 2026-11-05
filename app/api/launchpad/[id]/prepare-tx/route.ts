/**
 * POST /api/launchpad/[id]/prepare-tx
 *
 * SOL meme token path (stock_symbol = null):
 *   Returns { txABase64, txBBase64, mintAddress }
 *   TX A — platform fee only (no Phantom warning)
 *   TX B — Meteora DBC pool creation, which also creates the mint, + optional first buy
 *
 * xStock-paired path (stock_symbol set, e.g. "xNVDA"):
 *   Returns { txABase64, txBBase64, txCBase64, mintAddress, configAddress }
 *   TX A — platform fee only (Blowfish-safe)
 *   TX B — DBC createConfig (fresh keypair, quoteMint = xStock)
 *   TX C — DBC createPool (creates meme mint + metadata + pool + vaults)
 *
 * The mint only exists once the pool is created (the pool instruction creates it). If it is already
 * on chain, the token is activated directly ({ alreadyLaunched: true }) instead of rebuilding a pool tx
 * that can only fail. Once the fee is recorded (fee_paid_at), TX A is never asked again.
 *
 * For xStock retries where TX B (createConfig) already landed on-chain:
 *   Returns { txABase64: null, txBBase64: null, txCBase64, mintAddress, configAddress }
 *   The caller skips TX A+B and only presents TX C to the user.
 */
import { generateOmKeypair } from "@/lib/solana/vanity-mint";
import { solanaConnection } from "@/lib/solana/rpc";
import { NextResponse } from "next/server";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { activateIfPoolExists, type PendingToken } from "@/lib/launch/recover-pool";
import {
  buildSplitPoolTransactions,
  buildStockPairedTransactions,
  buildMetadataJson,
} from "@/lib/solana/dbc";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const sess = await requireWallet();
    if ("error" in sess) return sess.error;
    const body = await req.json() as { walletAddress?: string };
    if (!body.walletAddress || body.walletAddress !== sess.wallet) {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token, error } = await admin
      .from("launchpad_tokens")
      .select(
        "id,creator_wallet,status,name,ticker,description,logo_url,website,twitter,telegram," +
        "supply,first_buy_amount,is_scheduled,mint_address,vanity_secret_key,metadata_uri," +
        "tx_base64,tx_prepared_at,stock_symbol,dbc_config_secret,dbc_config_address,sol_fee_tier"
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
    // TX A ne contient QUE les frais de la plateforme (SOL et xStock). Une fois payés (vérifiés sur la chaîne
    // par record-fee-tx), on ne la redemande plus aux essais suivants.
    let feeAlreadyPaid = false;
    {
      // Lecture à part : si la colonne n'existe pas encore, on garde l'ancien comportement au lieu de casser le lancement.
      try {
        const { data: f } = await admin.from("launchpad_tokens").select("fee_paid_at").eq("id", id).maybeSingle();
        feeAlreadyPaid = Boolean(f?.fee_paid_at);
      } catch { /* colonne absente */ }
    }

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
      // L'adresse du token se termine toujours par « om » (générée à la volée)
      try {
        mintKeypair = await generateOmKeypair();
      } catch {
        return NextResponse.json({ error: "Génération de l'adresse trop longue, réessaie." }, { status: 503 });
      }
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
      feeTier:       (token.sol_fee_tier === "low" ? "low" : "standard") as "low" | "standard",
    };

    // ── Déjà lancé ? La mint n'existe sur la chaîne qu'une fois la pool créée ────────
    // Dans ce cas on active le token au lieu de renvoyer une création de pool vouée à l'échec.
    if (token.mint_address && process.env.SOLANA_RPC_URL) {
      try {
        const conn = solanaConnection();
        const mintInfo = await conn.getAccountInfo(new PublicKey(token.mint_address as string));
        if (mintInfo !== null) {
          const pool = await activateIfPoolExists(admin, { id, ...token } as PendingToken);
          if (pool) {
            return NextResponse.json({ alreadyLaunched: true, mintAddress: token.mint_address, poolAddress: pool });
          }
          return NextResponse.json(
            { error: "This token already exists on chain but its pool was not found yet. Wait a minute and retry." },
            { status: 409 },
          );
        }
      } catch (e) {
        console.warn("[prepare-tx] on-chain mint check failed:", e);
      }
    }

    // ── xStock: check if DBC config already on-chain (retry where TX B landed) ─
    if (isXStock && token.dbc_config_address) {
      try {
        const rpc = process.env.SOLANA_RPC_URL;
        if (rpc) {
          const conn = solanaConnection();
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
            txABase64:    feeAlreadyPaid ? null : parsed.a,
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
      txABase64: feeAlreadyPaid ? null : txABase64,
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
