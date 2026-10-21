/**
 * Modération : comptes bannis, vérification réelle des images, contrôle automatique optionnel.
 * Le contrôle automatique utilise l'API de modération d'OpenAI si OPENAI_API_KEY est défini
 * (gratuite, texte et images). Sans clé, les images partent en file de relecture pour les admins.
 */
import { createAdminClient } from "@/lib/supabase/server";

// ── Comptes bannis (cache 30 s) ────────────────────────────────────────────────
const banCache = new Map<string, { at: number; banned: boolean }>();
const norm = (w: string) => (/^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w);

export async function isBanned(walletRaw: string): Promise<boolean> {
  const wallet = norm(walletRaw);
  const c = banCache.get(wallet);
  if (c && Date.now() - c.at < 30_000) return c.banned;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (createAdminClient() as any).from("banned_wallets").select("wallet").eq("wallet", wallet).maybeSingle();
    const banned = !!data;
    banCache.set(wallet, { at: Date.now(), banned });
    if (banCache.size > 5000) banCache.clear();
    return banned;
  } catch { return false; }
}
export const forgetBan = (w: string) => banCache.delete(norm(w));

// ── Images : on lit les octets, pas le type annoncé par le client ───────────────
export function sniffImage(b: Uint8Array): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

// ── Contrôle automatique (optionnel) ───────────────────────────────────────────
const BLOCK_TEXT = ["sexual/minors", "hate/threatening", "violence/graphic", "self-harm/instructions"];
const BLOCK_IMAGE = ["sexual", "sexual/minors", "violence/graphic", "self-harm/instructions"];

type Input = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
async function ask(input: Input[], blockOn: string[]): Promise<"ok" | "blocked" | "unchecked"> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return "unchecked";
  try {
    const r = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "omni-moderation-latest", input }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return "unchecked";
    const j = (await r.json()) as { results?: { categories?: Record<string, boolean> }[] };
    const cats = j.results?.[0]?.categories ?? {};
    return blockOn.some((c) => cats[c]) ? "blocked" : "ok";
  } catch { return "unchecked"; }
}

export const moderateText = (text: string) => (text.trim() ? ask([{ type: "text", text }], BLOCK_TEXT) : Promise.resolve("ok" as const));
export const moderateImage = (bytes: ArrayBuffer, mime: string) =>
  ask([{ type: "image_url", image_url: { url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` } }], BLOCK_IMAGE);
