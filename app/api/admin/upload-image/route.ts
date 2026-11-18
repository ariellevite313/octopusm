import { sniffImage } from "@/lib/moderation";
import { limited } from "@/lib/limit";
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  { const lim = await limited(req, "upload-image", 10, 600_000); if (lim) return lim; }
  try {
  // Any authenticated user can upload a market icon (not admin-only)
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Validate type and size (max 2MB)
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type))
    return NextResponse.json({ error: "Invalid file type. Use JPG, PNG, WEBP or GIF." }, { status: 400 });
  if (file.size > 2 * 1024 * 1024)
    return NextResponse.json({ error: "File too large. Max 2MB." }, { status: 400 });

  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const admin = createAdminClient() as any;
  const arrayBuffer = await file.arrayBuffer();
  // Type réel lu dans les octets du fichier (le type annoncé par le navigateur peut mentir)
  const realType = sniffImage(new Uint8Array(await file.arrayBuffer()));
  if (!realType) return NextResponse.json({ error: "Invalid image file" }, { status: 400 });
  const { error } = await admin.storage
    .from("market-images")
    .upload(path, arrayBuffer, { contentType: realType, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: urlData } = admin.storage.from("market-images").getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error("[upload-image] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
