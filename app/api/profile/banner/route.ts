/** POST /api/profile/banner — multipart "file" (JPG/PNG/WEBP/GIF ≤ 4 Mo). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type))
    return NextResponse.json({ error: "Invalid file type. Use JPG, PNG, WEBP or GIF." }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "File too large. Max 4MB." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${s.wallet}/banner.${ext}`;
  const { error } = await admin.storage.from("avatars").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const url = `${admin.storage.from("avatars").getPublicUrl(path).data.publicUrl}?t=${Date.now()}`;
  const { error: upd } = await admin.from("wallets").update({ banner_src: url }).eq("address", s.wallet);
  if (upd) return NextResponse.json({ error: upd.message }, { status: 500 });
  revalidatePath(`/profile/${s.wallet}`);
  return NextResponse.json({ url });
}
