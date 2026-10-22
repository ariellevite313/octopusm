/**
 * Image donnée par lien (outils MCP) : le serveur la télécharge lui-même.
 * Garde-fous : https seulement, pas d'adresse interne (localhost, réseau privé), pas de redirection,
 * 10 s maximum, taille limitée, type réel vérifié par les premiers octets.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { sniffImage } from "@/lib/moderation";

export class ImageUrlError extends Error {}

function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

export async function fetchImage(url: string, maxBytes: number): Promise<{ buf: Buffer; mime: string }> {
  let u: URL;
  try { u = new URL(url); } catch { throw new ImageUrlError("image url is invalid"); }
  if (u.protocol !== "https:") throw new ImageUrlError("image url must start with https://");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new ImageUrlError("image url host is not allowed");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new ImageUrlError("image url host not found");
  if (addrs.some((a) => privateIp(a.address))) throw new ImageUrlError("image url host is not allowed");

  const res = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "OMdotfun-image-fetch" } }).catch(() => null);
  if (!res || !res.ok || !res.body) throw new ImageUrlError("could not download the image");
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new ImageUrlError(`image is too large (max ${maxBytes / 1024 / 1024} MB)`);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { reader.cancel().catch(() => {}); throw new ImageUrlError(`image is too large (max ${maxBytes / 1024 / 1024} MB)`); }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks);
  const mime = sniffImage(buf);
  if (!mime) throw new ImageUrlError("the link is not a PNG, JPEG, WebP or GIF image");
  return { buf, mime };
}
