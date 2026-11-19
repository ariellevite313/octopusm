/**
 * GET /api/terminal/meta?uri=…  Image d'un token tout juste créé, lue dans ses métadonnées (IPFS, Arweave…).
 * Seulement des passerelles connues (pas de requête vers n'importe quelle adresse).
 */
import { NextResponse } from "next/server";
import { limited } from "@/lib/limit";

const HOSTS = [/^ipfs\.io$/, /^([a-z0-9-]+\.)?mypinata\.cloud$/, /^gateway\.pinata\.cloud$/, /^cf-ipfs\.com$/, /^dweb\.link$/, /^([a-z0-9-]+\.)?ipfs\.(w3s\.link|dweb\.link|nftstorage\.link)$/, /^nftstorage\.link$/, /^arweave\.net$/, /^([a-z0-9-]+\.)?arweave\.net$/, /^gateway\.irys\.xyz$/, /^ipfs\.pump\.fun$/, /^metadata\.pump\.fun$/, /^storage\.bonk\.fun$/];
const cache = new Map<string, string | null>();

export async function GET(req: Request) {
  { const lim = await limited(req, "token-meta", 240); if (lim) return lim; }
  const uri = new URL(req.url).searchParams.get("uri") ?? "";
  let u: URL;
  try { u = new URL(uri); } catch { return NextResponse.json({ image: null }); }
  if (u.protocol !== "https:" || !HOSTS.some((h) => h.test(u.hostname))) return NextResponse.json({ image: null });
  if (cache.has(uri)) return NextResponse.json({ image: cache.get(uri) }, { headers: { "Cache-Control": "public, max-age=86400" } });
  let image: string | null = null;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(6000), redirect: "error" });
    if (r.ok && Number(r.headers.get("content-length") ?? 0) < 200_000) {
      const j = (await r.json()) as { image?: unknown };
      if (typeof j.image === "string" && /^https:\/\//.test(j.image) && j.image.length < 500) image = j.image;
    }
  } catch { /* image inconnue */ }
  cache.set(uri, image);
  if (cache.size > 3000) cache.delete(cache.keys().next().value as string);
  return NextResponse.json({ image }, { headers: { "Cache-Control": image ? "public, max-age=86400" : "public, max-age=60" } });
}
