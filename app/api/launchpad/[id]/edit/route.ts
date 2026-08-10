import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkNameAvailability, isProtectedName } from "@/services/launchpad-service";

type RouteParams = { params: Promise<{ id: string }> };

const MAX_LOGO_BYTES       = 5  * 1024 * 1024;
const MAX_WHITEPAPER_BYTES = 20 * 1024 * 1024;
const VALID_CATEGORIES     = new Set(["Meme","Utility","AI","Gaming","DeFi","NFT","x402"]);
const VALID_LOGO_TYPES     = new Set(["image/jpeg","image/png","image/webp","image/gif"]);

function isValidUrl(s: string) {
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; }
  catch { return false; }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const form        = await req.formData();
    const rawPayload  = form.get("payload");
    if (typeof rawPayload !== "string") {
      return NextResponse.json({ error: "Missing payload" }, { status: 400 });
    }

    const payload = JSON.parse(rawPayload) as {
      wallet_address: string;
      name?: string;
      ticker?: string;
      description?: string;
      category?: string;
      website?: string;
      twitter?: string;
      telegram?: string;
      discord?: string;
      other_social?: string;
    };

    if (!payload.wallet_address) {
      return NextResponse.json({ error: "wallet_address is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Fetch token and verify ownership
    const { data: token } = await admin
      .from("launchpad_tokens")
      .select("id, creator_wallet, name, ticker, status")
      .eq("id", id)
      .maybeSingle();

    if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    if (token.creator_wallet !== payload.wallet_address) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (token.status === "cancelled") {
      return NextResponse.json({ error: "Cannot edit a cancelled token" }, { status: 409 });
    }

    // Build update object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {};

    // Name / ticker — re-check availability only if changed
    const newName   = payload.name?.trim();
    const newTicker = payload.ticker?.trim().toUpperCase();

    // Reject protected names/tickers
    if (newName   && isProtectedName(newName))   return NextResponse.json({ error: "This name is reserved" }, { status: 409 });
    if (newTicker && isProtectedName(newTicker)) return NextResponse.json({ error: "This ticker is reserved" }, { status: 409 });

    if (newName && newName !== token.name) {
      const { nameAvailable } = await checkNameAvailability(newName, newTicker ?? token.ticker);
      if (!nameAvailable) return NextResponse.json({ error: "Name is already taken" }, { status: 409 });
      update.name = newName;
    }
    if (newTicker && newTicker !== token.ticker) {
      const { tickerAvailable } = await checkNameAvailability(update.name ?? token.name, newTicker);
      if (!tickerAvailable) return NextResponse.json({ error: "Ticker is already taken" }, { status: 409 });
      update.ticker = newTicker;
    }

    if (payload.description !== undefined) update.description = payload.description;
    if (payload.category !== undefined) {
      if (!VALID_CATEGORIES.has(payload.category)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      update.category = payload.category;
    }

    // Socials — validate URL format only if non-empty
    const socialFields = ["website","twitter","telegram","discord","other_social"] as const;
    for (const field of socialFields) {
      if (payload[field] !== undefined) {
        const val = payload[field] as string;
        if (val && !isValidUrl(val)) {
          return NextResponse.json({ error: `Invalid URL for ${field}` }, { status: 400 });
        }
        update[field] = val || null;
      }
    }

    // Logo re-upload
    const logoFile = form.get("logo");
    if (logoFile instanceof Blob && logoFile.size > 0) {
      if (!VALID_LOGO_TYPES.has(logoFile.type)) {
        return NextResponse.json({ error: "Unsupported logo format" }, { status: 400 });
      }
      if (logoFile.size > MAX_LOGO_BYTES) {
        return NextResponse.json({ error: "Logo too large (max 5 MB)" }, { status: 400 });
      }
      const ext  = logoFile.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const buf  = await logoFile.arrayBuffer();
      const { error: uploadErr } = await admin.storage
        .from("market-images")
        .upload(path, buf, { contentType: logoFile.type, upsert: false });
      if (!uploadErr) {
        const { data: urlData } = admin.storage.from("market-images").getPublicUrl(path);
        update.logo_url = urlData.publicUrl;
      }
    }

    // Whitepaper re-upload
    const pdfFile = form.get("whitepaper");
    if (pdfFile instanceof Blob && pdfFile.size > 0) {
      if (pdfFile.size > MAX_WHITEPAPER_BYTES) {
        return NextResponse.json({ error: "PDF too large (max 20 MB)" }, { status: 400 });
      }
      const pdfPath = `whitepapers/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
      const pdfBuf  = await pdfFile.arrayBuffer();
      const { error: pdfErr } = await admin.storage
        .from("market-images")
        .upload(pdfPath, pdfBuf, { contentType: "application/pdf", upsert: false });
      if (!pdfErr) {
        const { data: pdfUrl } = admin.storage.from("market-images").getPublicUrl(pdfPath);
        update.whitepaper_url = pdfUrl.publicUrl;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true, message: "Nothing to update" });
    }

    const { error: updateErr } = await admin
      .from("launchpad_tokens")
      .update(update)
      .eq("id", id);

    if (updateErr) {
      console.error("edit token error:", updateErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("edit token unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
