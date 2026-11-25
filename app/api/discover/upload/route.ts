/** POST /api/discover/upload (image) : icône, bannière ou capture d'une fiche Discover. 2 Mo au plus, type vérifié dans les octets. */
import { NextResponse } from "next/server";
import { sniffImage } from "@/lib/moderation";
import { limited } from "@/lib/limit";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";

const MAX = 2 * 1024 * 1024;

export async function POST(req: Request) {
  { const lim = await limited(req, "discover-upload", 30, 3_600_000); if (lim) return lim; }
  const s = await requireWallet();
  if ("error" in s) return s.error;
  try {
    const file = (await req.formData()).get("image");
    if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "Image missing" }, { status: 400 });
    if (file.size > MAX) return NextResponse.json({ error: "Image too large (max 2 MB)" }, { status: 400 });
    const bytes = await file.arrayBuffer();
    const type = sniffImage(new Uint8Array(bytes));
    if (!type) return NextResponse.json({ error: "Invalid image file" }, { status: 400 });
    const path = `discover/${Date.now()}-${Math.random().toString(36).slice(2)}.${type.split("/")[1].replace("jpeg", "jpg")}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { error } = await db.storage.from("market-images").upload(path, bytes, { contentType: type, upsert: false });
    if (error) return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    return NextResponse.json({ url: db.storage.from("market-images").getPublicUrl(path).data.publicUrl });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
