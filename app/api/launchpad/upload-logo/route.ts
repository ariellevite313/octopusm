import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const VALID_LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * POST /api/launchpad/upload-logo
 * Envoie le logo d'un token avant la transaction de lancement, pour que son URL
 * puisse être écrite sur la chaîne (imageUri). Renvoie { url }.
 */
export async function POST(req: Request) {
  const sess = await requireWallet();
  if ("error" in sess) return sess.error;
  try {
    const form = await req.formData();
    const file = form.get("logo");
    if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "Logo missing" }, { status: 400 });
    if (!VALID_LOGO_TYPES.has(file.type)) return NextResponse.json({ error: "Unsupported logo format. Use PNG, JPG, WebP, or GIF" }, { status: 400 });
    if (file.size > MAX_LOGO_BYTES) return NextResponse.json({ error: "Logo too large (max 5 MB)" }, { status: 400 });

    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { error } = await admin.storage.from("market-images").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (error) return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    const { data } = admin.storage.from("market-images").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    console.error("[launchpad/upload-logo]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
