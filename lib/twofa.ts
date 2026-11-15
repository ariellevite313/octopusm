/**
 * Double vérification (2FA) : codes à 6 chiffres d'une application d'authentification (Google Authenticator, Authy…),
 * norme TOTP (RFC 6238, SHA-1, 30 s), plus 8 codes de secours à usage unique.
 * Au choix de l'utilisateur ; une fois activée, elle est demandée pour les actions sensibles (wallets d'IA, désactivation).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret } from "@/lib/agent-wallet/keys";
import { rateHit } from "@/lib/rate-limit";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_S = 30;

export function base32(buf: Buffer): string {
  let bits = 0, val = 0, out = "";
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function unbase32(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0; const out: number[] = [];
  for (const c of clean) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

/** Code à 6 chiffres pour le pas `step` (nombre de périodes de 30 s depuis 1970). */
export function totp(secret: Buffer, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", secret).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** Pas accepté (tolérance d'un pas avant / après pour le décalage d'horloge), ou null. Jamais un pas déjà utilisé. */
export function matchStep(secret: Buffer, code: string, nowMs: number, lastStep: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = Math.floor(nowMs / 1000 / STEP_S);
  for (const s of [now, now - 1, now + 1]) {
    if (s <= lastStep) continue;
    const a = Buffer.from(totp(secret, s)), b = Buffer.from(code);
    if (timingSafeEqual(a, b)) return s;
  }
  return null;
}

export const hashCode = (c: string) => createHash("sha256").update(c.replace(/[^A-Za-z0-9]/g, "").toUpperCase()).digest("hex");
export function recoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => { const r = base32(randomBytes(6)).slice(0, 10); return `${r.slice(0, 5)}-${r.slice(5)}`; });
}

// ── Serveur ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;
type Row = { wallet: string; secret: string; enabled: boolean; recovery: string[]; last_step: number };

async function row(wallet: string): Promise<Row | null> {
  const { data } = await db().from("user_2fa").select("wallet, secret, enabled, recovery, last_step").eq("wallet", wallet).maybeSingle();
  return (data as Row | null) ?? null;
}

export async function status(wallet: string) {
  const r = await row(wallet);
  return { enabled: !!r?.enabled, recoveryLeft: r?.enabled ? r.recovery.length : 0 };
}

/** Nouveau secret (pas encore actif) : lien otpauth pour le QR code. Refusé si la 2FA est déjà active. */
export async function beginSetup(wallet: string, label: string) {
  const r = await row(wallet);
  if (r?.enabled) throw new TwoFaError("Two-step verification is already on");
  const secret = randomBytes(20);
  const b32 = base32(secret);
  const { error } = await db().from("user_2fa").upsert({ wallet, secret: encryptSecret(secret), enabled: false, recovery: [], last_step: 0 }, { onConflict: "wallet" });
  if (error) throw new Error(error.message);
  const uri = `otpauth://totp/${encodeURIComponent(`OMdotfun:${label}`)}?secret=${b32}&issuer=OMdotfun&algorithm=SHA1&digits=6&period=30`;
  return { secret: b32, uri };
}

/** Premier code correct : la 2FA s'active et les codes de secours sont donnés une seule fois. */
export async function enable(wallet: string, code: string): Promise<string[]> {
  const r = await row(wallet);
  if (!r || r.enabled) throw new TwoFaError("Start the setup again");
  const step = matchStep(decryptSecret(r.secret), code.trim(), Date.now(), r.last_step);
  if (step == null) throw new TwoFaError("Wrong code, try again");
  const codes = recoveryCodes();
  const { error } = await db().from("user_2fa").update({ enabled: true, enabled_at: new Date().toISOString(), last_step: step, recovery: codes.map(hashCode) }).eq("wallet", wallet).eq("enabled", false);
  if (error) throw new Error(error.message);
  return codes;
}

/** Vérifie un code (6 chiffres ou code de secours, consommé). true si la 2FA n'est pas active. */
export async function verify(wallet: string, code: string | null): Promise<boolean> {
  const r = await row(wallet);
  if (!r?.enabled) return true;
  const c = (code ?? "").trim();
  if (!c) return false;
  if (/^\d{6}$/.test(c)) {
    const step = matchStep(decryptSecret(r.secret), c, Date.now(), r.last_step);
    if (step == null) return false;
    // Mise à jour conditionnelle : deux requêtes simultanées ne peuvent pas utiliser le même code
    const { data } = await db().from("user_2fa").update({ last_step: step }).eq("wallet", wallet).lt("last_step", step).select("wallet");
    return !!data?.length;
  }
  const h = hashCode(c);
  if (!r.recovery.includes(h)) return false;
  const { data } = await db().from("user_2fa").update({ recovery: r.recovery.filter((x) => x !== h) }).eq("wallet", wallet).contains("recovery", [h]).select("wallet");
  return !!data?.length;
}

export async function disable(wallet: string, code: string): Promise<void> {
  const r = await row(wallet);
  if (!r?.enabled) throw new TwoFaError("Two-step verification is off");
  if (!(await verify(wallet, code))) throw new TwoFaError("Wrong code, try again");
  const { error } = await db().from("user_2fa").delete().eq("wallet", wallet);
  if (error) throw new Error(error.message);
}

export class TwoFaError extends Error {}

/**
 * Pour les routes sensibles : null si c'est bon, sinon la réponse 401 à renvoyer.
 * Le code arrive dans l'en-tête x-2fa-code (jamais dans l'URL).
 */
export async function requireSecondFactor(wallet: string, req: Request): Promise<NextResponse | null> {
  const st = await status(wallet).catch(() => null);
  if (!st) return NextResponse.json({ error: "Could not check two-step verification" }, { status: 503 });
  if (!st.enabled) return null;
  const code = req.headers.get("x-2fa-code");
  // Pas plus de 10 vérifications en 10 minutes : empêche de deviner le code
  if (!(await rateHit(`2fa-check:${wallet}`, 10, 600_000))) return NextResponse.json({ error: "Too many tries, wait a few minutes", twofa: true }, { status: 429 });
  if (await verify(wallet, code)) return null;
  return NextResponse.json({ error: code ? "Wrong two-step code" : "Two-step code required", twofa: true }, { status: 401 });
}
