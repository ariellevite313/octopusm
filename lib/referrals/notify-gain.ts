/** Notification « tu as gagné X $ grâce à ton filleul ». Ne lève jamais d'erreur ; une seule par gain (ref unique). */
import { createAdminClient } from "@/lib/supabase/server";

const norm = (w: string) => (/^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w);

export async function notifyReferralGain(p: { referrer: string; referred: string; usd: number; clt?: number; ref: string; source: "trade" | "bet" }): Promise<void> {
  try {
    if (!(p.usd > 0) && !((p.clt ?? 0) > 0)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    await db.from("notifications").insert({
      wallet: norm(p.referrer), kind: "referral_gain", actor: norm(p.referred), ref: `rg:${p.ref}`.slice(0, 200),
      data: { usd: Math.round(p.usd * 1e6) / 1e6, clt: p.clt ?? 0, source: p.source },
    });
  } catch { /* sans effet sur le gain */ }
}
