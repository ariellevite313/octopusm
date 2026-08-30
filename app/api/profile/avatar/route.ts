import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
  // Verify session
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type))
    return NextResponse.json({ error: "Invalid file type. Use JPG, PNG, WEBP or GIF." }, { status: 400 });
  if (file.size > 2 * 1024 * 1024)
    return NextResponse.json({ error: "File too large. Max 2MB." }, { status: 400 });

  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${wallet}/avatar.${ext}`;

  // Use admin client to bypass RLS on storage
  const admin = createAdminClient() as any;
  const arrayBuffer = await file.arrayBuffer();
  const { error } = await admin.storage
    .from("avatars")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: urlData } = admin.storage.from("avatars").getPublicUrl(path);
  return NextResponse.json({ url: `${urlData.publicUrl}?t=${Date.now()}` });
  } catch (err) {
    console.error("[avatar] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
