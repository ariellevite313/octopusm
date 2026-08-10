import { NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { checkNameAvailability, isProtectedName } from "@/services/launchpad-service";

// Max file sizes
const MAX_LOGO_BYTES       = 5  * 1024 * 1024; // 5 MB
const MAX_WHITEPAPER_BYTES = 20 * 1024 * 1024; // 20 MB

const VALID_CATEGORIES = new Set(["Meme","Utility","AI","Gaming","DeFi","NFT","x402"]);

type FeeRecipient = { address: string; share_pct: number };

type CreatePayload = {
  name: string;
  ticker: string;
  category: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  discord?: string;
  other_social?: string;
  supply: number;
  creator_fee_pct: 1;
  fee_recipients: FeeRecipient[];
  share_top100: boolean;
  share_top100_pct: number;
  first_buy_enabled: boolean;
  first_buy_amount: number;
  is_scheduled: boolean;
  scheduled_at: string | null;
  creator_wallet: string;
};

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const rawPayload = form.get("payload");
    if (typeof rawPayload !== "string") {
      return NextResponse.json({ error: "Missing payload" }, { status: 400 });
    }

    const payload = JSON.parse(rawPayload) as CreatePayload;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!payload.name?.trim())        return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!payload.ticker?.trim())      return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
    if (!payload.creator_wallet)      return NextResponse.json({ error: "Wallet not provided" }, { status: 400 });

    if (isProtectedName(payload.name) || isProtectedName(payload.ticker)) {
      return NextResponse.json({ error: "This name or ticker is reserved" }, { status: 409 });
    }

    const { nameAvailable, tickerAvailable } = await checkNameAvailability(payload.name, payload.ticker);
    if (!nameAvailable)   return NextResponse.json({ error: "Name is already taken" }, { status: 409 });
    if (!tickerAvailable) return NextResponse.json({ error: "Ticker is already taken" }, { status: 409 });

    if (!VALID_CATEGORIES.has(payload.category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (payload.supply < 10_000_000 || payload.supply > 1_000_000_000) {
      return NextResponse.json({ error: "Supply must be between 10M and 1B" }, { status: 400 });
    }
    if (payload.creator_fee_pct !== 1) {
      return NextResponse.json({ error: "Creator fee must be 1%" }, { status: 400 });
    }

    // ── File upload ─────────────────────────────────────────────────────────
    let logo_url: string | null = null;
    let whitepaper_url: string | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminUpload = createAdminClient() as any;

    const logoFile = form.get("logo");
    if (logoFile instanceof Blob && logoFile.size > 0) {
      if (logoFile.size > MAX_LOGO_BYTES) {
        return NextResponse.json({ error: "Logo too large (max 5 MB)" }, { status: 400 });
      }
      const ext  = logoFile.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
      const path = `launchpad/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const buf  = await logoFile.arrayBuffer();
      const { error: uploadErr } = await adminUpload.storage
        .from("market-images")
        .upload(path, buf, { contentType: logoFile.type, upsert: false });
      if (!uploadErr) {
        const { data: urlData } = adminUpload.storage.from("market-images").getPublicUrl(path);
        logo_url = urlData.publicUrl;
      }
    }

    const pdfFile = form.get("whitepaper");
    if (pdfFile instanceof Blob && pdfFile.size > 0) {
      if (pdfFile.size > MAX_WHITEPAPER_BYTES) {
        return NextResponse.json({ error: "PDF too large (max 20 MB)" }, { status: 400 });
      }
    }

    // ── Generate mint keypair ───────────────────────────────────────────────
    // Standard random keypair — no vanity suffix required.
    // Secret is stored as base64 (native Node.js Buffer, no external deps).
    const mintKeypair = Keypair.generate();
    const mintAddress = mintKeypair.publicKey.toBase58();
    const mintSecret  = Buffer.from(mintKeypair.secretKey).toString("base64");

    // ── Insert token ────────────────────────────────────────────────────────
    const { data, error: insertError } = await adminUpload
      .from("launchpad_tokens")
      .insert({
        name:             payload.name.trim(),
        ticker:           payload.ticker.trim().toUpperCase(),
        category:         payload.category,
        description:      payload.description,
        logo_url,
        whitepaper_url,
        website:          payload.website || null,
        twitter:          payload.twitter || null,
        telegram:         payload.telegram || null,
        discord:          payload.discord  || null,
        other_social:     payload.other_social || null,
        supply:           payload.supply,
        creator_fee_pct:  payload.creator_fee_pct,
        platform_fee_pct: payload.creator_fee_pct,
        fee_recipients:   payload.fee_recipients.length > 0 ? payload.fee_recipients : null,
        share_top100:     payload.share_top100,
        share_top100_pct: payload.share_top100 ? payload.share_top100_pct : null,
        first_buy_amount: payload.first_buy_enabled ? payload.first_buy_amount : null,
        is_scheduled:        payload.is_scheduled,
        scheduled_at:        payload.is_scheduled ? payload.scheduled_at : null,
        scheduled_paid_sol:  payload.is_scheduled ? 0.1 : null,
        creator_wallet:      payload.creator_wallet,
        status:           "pending",
        is_tradeable:     false,
        mint_address:     mintAddress,
        vanity_secret_key: mintSecret,
        vanity_job_id:    "done",
      })
      .select("id")
      .single();

    if (insertError || !data) {
      console.error("launchpad create error:", insertError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ id: (data as { id: string }).id, mintAddress });

  } catch (err) {
    console.error("launchpad create unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
