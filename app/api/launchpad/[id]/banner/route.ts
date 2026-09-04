/**
 * POST /api/launchpad/[id]/banner
 * Uploads a banner image and saves the URL to the token's banner_url field.
 * Only the token creator can update their banner.
 * The previous banner file is deleted from storage before uploading the new one.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_EXTS  = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const MAX_BYTES     = 5 * 1024 * 1024; // 5 MB
const BUCKET        = "market-images";

/** Extract the storage path from a Supabase public URL, e.g. "banners/xyz.png" */
function extractStoragePath(publicUrl: string): string | null {
  try {
    const marker = `/${BUCKET}/`;
    const idx    = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return publicUrl.slice(idx + marker.length);
  } catch {
    return null;
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const walletAddress = await getWalletAddress();
    if (!walletAddress) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient() as any;

    // Verify ownership and get current banner_url for cleanup
    const { data: token, error: fetchErr } = await admin
      .from("launchpad_tokens")
      .select("id, creator_wallet, banner_url")
      .eq("id", params.id)
      .single();

    if (fetchErr || !token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    if (token.creator_wallet !== walletAddress) {
      return NextResponse.json({ error: "Not the token creator" }, { status: 403 });
    }

    const formData = await req.formData();
    const file     = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // Validate MIME type (reported by browser)
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Use JPG, PNG, WEBP or GIF." },
        { status: 400 },
      );
    }

    // Validate extension from filename
    const rawExt  = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXTS.has(rawExt)) {
      return NextResponse.json(
        { error: "Invalid file extension. Use .jpg, .png, .webp or .gif." },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
    }

    const ext  = rawExt === "jpeg" ? "jpg" : rawExt;
    const path = `banners/${params.id}-${Date.now()}.${ext}`;

    // Upload new file
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, { contentType: file.type, upsert: true });

    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    const banner_url        = urlData.publicUrl as string;

    // Update DB
    await admin
      .from("launchpad_tokens")
      .update({ banner_url })
      .eq("id", params.id);

    // Delete previous banner file (non-blocking, best-effort)
    if (token.banner_url) {
      const oldPath = extractStoragePath(token.banner_url as string);
      if (oldPath && oldPath !== path) {
        admin.storage.from(BUCKET).remove([oldPath]).catch(() => { /* ignore */ });
      }
    }

    return NextResponse.json({ banner_url });
  } catch (err) {
    console.error("[banner] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
