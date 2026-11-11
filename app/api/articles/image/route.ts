/** POST /api/articles/image (multipart: image) — envoie une image d'article (couverture ou image du texte). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { moderateImage, sniffImage } from "@/lib/moderation";
import { rateHit } from "@/lib/rate-limit";
import { MAX_IMAGE_BYTES } from "@/lib/social/posts";

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  if (!(await rateHit(`article-img:${s.wallet}`, 40, 3600_000))) return NextResponse.json({ error: "Too many uploads, try again later" }, { status: 429 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Invalid form" }, { status: 400 }); }
  const f = form.get("image");
  if (!f || typeof f === "string" || !("arrayBuffer" in f)) return NextResponse.json({ error: "No image" }, { status: 400 });
  if (f.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image too large (max 5 MB)" }, { status: 400 });

  const bytes = await f.arrayBuffer();
  const real = sniffImage(new Uint8Array(bytes));
  if (!real) return NextResponse.json({ error: "This file is not a valid image (JPG, PNG, WEBP, GIF)" }, { status: 400 });
  if ((await moderateImage(bytes, real)) === "blocked") return NextResponse.json({ error: "This image goes against our rules" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const path = `${s.wallet}/articles/${crypto.randomUUID()}.${real.split("/")[1].replace("jpeg", "jpg")}`;
  const { error } = await admin.storage.from("post-images").upload(path, bytes, { contentType: real });
  if (error) return NextResponse.json({ error: "Upload failed, try again" }, { status: 500 });
  return NextResponse.json({ url: admin.storage.from("post-images").getPublicUrl(path).data.publicUrl });
}
