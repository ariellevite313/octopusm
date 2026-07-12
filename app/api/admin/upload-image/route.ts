import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  // Auth check — admin only
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
  const { error } = await admin.storage
    .from("market-images")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: urlData } = admin.storage.from("market-images").getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
}
