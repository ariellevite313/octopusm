import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { MAX_WHITEPAPER_BYTES, looksLikePdf } from "@/lib/launch/whitepaper";

/**
 * POST /api/launchpad/upload-whitepaper
 * Envoie le whitepaper AVANT la transaction de lancement. La sauvegarde après la transaction (Arc)
 * reste alors une petite requête : un gros PDF ne peut plus la faire échouer et perdre le token.
 * Renvoie { url }.
 */
export async function POST(req: Request) {
  const sess = await requireWallet();
  if ("error" in sess) return sess.error;
  try {
    const form = await req.formData();
    const file = form.get("whitepaper");
    if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "PDF missing" }, { status: 400 });
    if (file.size > MAX_WHITEPAPER_BYTES) return NextResponse.json({ error: "PDF too large (max 1 MB). Compress it first, for example with ilovepdf.com" }, { status: 400 });
    const buf = await file.arrayBuffer();
    if (!looksLikePdf(buf)) return NextResponse.json({ error: "This file is not a valid PDF" }, { status: 400 });

    const path = `whitepapers/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { error } = await admin.storage.from("market-images").upload(path, buf, { contentType: "application/pdf", upsert: false });
    if (error) {
      console.error("[upload-whitepaper]", error.message);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
    const { data } = admin.storage.from("market-images").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    console.error("[upload-whitepaper]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
