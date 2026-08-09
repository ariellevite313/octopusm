import { NextResponse } from "next/server";
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
  creator_fee_pct: 1 | 2;
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
    if (payload.creator_fee_pct !== 1 && payload.creator_fee_pct !== 2) {
      return NextResponse.json({ error: "Creator fee must be 1 or 2" }, { status: 400 });
    }

    // ── File size check ─────────────────────────────────────────────────────
    // TODO: upload to Cloudflare R2 when configured.
    let logo_url: string | null = null;
    let whitepaper_url: string | null = null;

    const logoFile = form.get("logo");
    if (logoFile instanceof Blob) {
      if (logoFile.size > MAX_LOGO_BYTES) {
        return NextResponse.json({ error: "Logo too large (max 5 MB)" }, { status: 400 });
      }
    }

    const pdfFile = form.get("whitepaper");
    if (pdfFile instanceof Blob) {
      if (pdfFile.size > MAX_WHITEPAPER_BYTES) {
        return NextResponse.json({ error: "PDF too large (max 20 MB)" }, { status: 400 });
      }
    }

    // ── Claim a vanity keypair from the pre-generated pool ──────────────────
    // We use a placeholder UUID during the claim so we can release it if the
    // token insert fails (we don't have a real token ID yet).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Check pool availability first (non-locking read for fast feedback)
    const { count: available } = await admin
      .from("vanity_keypair_pool")
      .select("id", { count: "exact", head: true })
      .is("assigned_token_id", null);

    if (!available || available === 0) {
      console.error("Vanity keypair pool is empty!");
      return NextResponse.json(
        { error: "No vanity addresses available right now. Please try again in a few minutes." },
        { status: 503 }
      );
    }

    // ── Insert pending token ─────────────────────────────────────────────────
    // We insert first to get a real ID, then claim the keypair with that ID.
    const { data, error: insertError } = await admin
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
        vanity_job_id:    "claiming",
      })
      .select("id")
      .single();

    if (insertError || !data) {
      console.error("launchpad create error:", insertError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const tokenId = (data as { id: string }).id;

    // ── Atomically claim a keypair from the pool ─────────────────────────────
    // Uses FOR UPDATE SKIP LOCKED — safe under concurrent requests.
    const { data: claimed, error: claimError } = await admin
      .rpc("claim_vanity_keypair", { p_token_id: tokenId });

    if (claimError || !claimed || claimed.length === 0) {
      // Pool was empty between our check and the claim — roll back the token
      console.error("Vanity claim failed:", claimError?.message ?? "empty pool");
      const { error: deleteErr } = await admin
        .from("launchpad_tokens").delete().eq("id", tokenId);
      if (deleteErr) {
        // Rollback failed — mark as cancelled so it doesn't block future creation
        console.error("Rollback delete failed, marking cancelled:", deleteErr);
        await admin
          .from("launchpad_tokens")
          .update({ status: "cancelled", vanity_job_id: "pool_empty" })
          .eq("id", tokenId);
      }
      return NextResponse.json(
        { error: "No vanity addresses available right now. Please try again in a few minutes." },
        { status: 503 }
      );
    }

    const { pool_id, pub_key, sec_key } = claimed[0] as {
      pool_id: string;
      pub_key:  string;
      sec_key:  string;
    };

    // ── Update token with mint address immediately ───────────────────────────
    const { error: updateError } = await admin
      .from("launchpad_tokens")
      .update({
        mint_address:      pub_key,
        vanity_secret_key: sec_key,
        vanity_job_id:     "done",
      })
      .eq("id", tokenId);

    if (updateError) {
      // Update failed — release the keypair back to the pool and clean up token
      console.error("Token update failed:", updateError);
      await admin.rpc("release_vanity_keypair", { p_pool_id: pool_id });
      const { error: deleteErr } = await admin
        .from("launchpad_tokens").delete().eq("id", tokenId);
      if (deleteErr) {
        console.error("Cleanup delete failed, marking cancelled:", deleteErr);
        await admin
          .from("launchpad_tokens")
          .update({ status: "cancelled", vanity_job_id: "update_failed" })
          .eq("id", tokenId);
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ id: tokenId, mintAddress: pub_key });

  } catch (err) {
    console.error("launchpad create unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
