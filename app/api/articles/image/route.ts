/** POST /api/articles/image (multipart: image) — envoie une image d'article (couverture ou image du texte). */
import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/social/session";
import { uploadArticleImage } from "@/lib/social/create-article";

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Invalid form" }, { status: 400 }); }
  const f = form.get("image");
  if (!f || typeof f === "string" || !("arrayBuffer" in f)) return NextResponse.json({ error: "No image" }, { status: 400 });
  const r = await uploadArticleImage(s.wallet, await f.arrayBuffer());
  return NextResponse.json(r.data, { status: r.status });
}
