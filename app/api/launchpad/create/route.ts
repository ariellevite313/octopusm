import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkNameAvailability, isProtectedName } from "@/services/launchpad-service";

// Max file sizes
const MAX_LOGO_BYTES       = 5  * 1024 * 1024; // 5 MB
const MAX_WHITEPAPER_BYTES = 20 * 1024 * 1024; // 20 MB
const VALID_LOGO_TYPES     = new Set(["image/jpeg","image/png","image/webp","image/gif"]);

const VALID_CATEGORIES = new Set(["Meme","Utility","AI","Gaming","DeFi","NFT","x402"]);

function isValidUrl(s: string | null | undefined): boolean {
  if (!s) return true; // optional fields
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; }
  catch { return false; }
}

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

    // Scheduled date must be at least 1 hour in the future (client picks tomorrow min, server enforces 1h)
    if (payload.is_scheduled) {
      if (!payload.scheduled_at) {
        return NextResponse.json({ error: "scheduled_at is required for scheduled launches" }, { status: 400 });
      }
      const scheduledMs = new Date(payload.scheduled_at).getTime();
      if (isNaN(scheduledMs) || scheduledMs < Date.now() + 60 * 60 * 1000) {
        return NextResponse.json({ error: "Scheduled date must be at least 1 hour in the future" }, { status: 400 });
      }
    }

    // First buy amount must be between 0.01 and 100 SOL
    if (payload.first_buy_enabled && (payload.first_buy_amount < 0.01 || payload.first_buy_amount > 100)) {
      return NextResponse.json({ error: "First buy amount must be between 0.01 and 100 SOL" }, { status: 400 });
    }

    // Validate social URLs server-side — reject javascript: and other non-http(s) schemes
    const socialFields = ["website", "twitter", "telegram", "discord", "other_social"] as const;
    for (const field of socialFields) {
      const val = (payload as Record<string, unknown>)[field] as string | undefined;
      if (val && !isValidUrl(val)) {
        return NextResponse.json({ error: `Invalid URL for ${field}` }, { status: 400 });
      }
    }

    // ── File upload ─────────────────────────────────────────────────────────
    let logo_url: string | null = null;
    let whitepaper_url: string | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminUpload = createAdminClient() as any;

    const logoFile = form.get("logo");
    if (logoFile instanceof Blob && logoFile.size > 0) {
      if (!VALID_LOGO_TYPES.has(logoFile.type)) {
        return NextResponse.json({ error: "Unsupported logo format. Use PNG, JPG, WebP, or GIF" }, { status: 400 });
      }
      if (logoFile.size > MAX_LOGO_BYTES) {
        return NextResponse.json({ error: "Logo too large (max 5 MB)" }, { status: 400 });
      }
      const ext  = logoFile.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const buf  = await logoFile.arrayBuffer();
      const { error: uploadErr } = await adminUpload.storage
        .from("market-images")
        .upload(path, buf, { contentType: logoFile.type, upsert: false });
      if (uploadErr) {
        console.error("Logo upload error:", uploadErr.message);
      } else {
        const { data: urlData } = adminUpload.storage.from("market-images").getPublicUrl(path);
        logo_url = urlData.publicUrl;
      }
    }

    const pdfFile = form.get("whitepaper");
    if (pdfFile instanceof Blob && pdfFile.size > 0) {
      if (pdfFile.size > MAX_WHITEPAPER_BYTES) {
        return NextResponse.json({ error: "PDF too large (max 20 MB)" }, { status: 400 });
      }
      const pdfPath = `whitepapers/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
      const pdfBuf  = await pdfFile.arrayBuffer();
      const { error: pdfErr } = await adminUpload.storage
        .from("market-images")
        .upload(pdfPath, pdfBuf, { contentType: "application/pdf", upsert: false });
      if (pdfErr) {
        console.error("Whitepaper upload error:", pdfErr.message);
      } else {
        const { data: pdfUrl } = adminUpload.storage.from("market-images").getPublicUrl(pdfPath);
        whitepaper_url = pdfUrl.publicUrl;
      }
    }

    // ── Insert token ────────────────────────────────────────────────────────
    // Mint keypair is generated lazily in prepare-tx (first Launch click)
    // so the CA is only revealed at launch time, not at creation time.
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
        // Informational only — on-chain fees are governed by DBC_CONFIG_KEY (3% total: 1% creator + 2% platform).
        // These fields do NOT affect the SDK call and are stored for audit purposes only.
        creator_fee_pct:  payload.creator_fee_pct,  // always 1
        platform_fee_pct: 2,
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
        // mint_address and vanity_secret_key are set lazily in prepare-tx
      })
      .select("id")
      .single();

    if (insertError || !data) {
      console.error("launchpad create error:", insertError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ id: (data as { id: string }).id });

  } catch (err) {
    console.error("launchpad create unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
