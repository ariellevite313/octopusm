/** Création de notifications. Ne lève jamais d'erreur et ne notifie jamais soi-même. */
import { createAdminClient } from "@/lib/supabase/server";

export type NotifKind = "follow" | "mention" | "reply" | "like" | "repost" | "quote";
const norm = (w: string) => (/^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w);

export async function notify(items: { wallet: string; kind: NotifKind; actor: string; postId?: string | null }[]): Promise<void> {
  try {
    const rows = items
      .filter((i) => i.wallet && i.actor && norm(i.wallet) !== norm(i.actor))
      .map((i) => ({ wallet: norm(i.wallet), kind: i.kind, actor: norm(i.actor), post_id: i.postId ?? null }));
    if (!rows.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    // Un par un : un doublon (index unique) ne doit pas faire échouer les autres
    for (const r of rows) await db.from("notifications").insert(r);
  } catch (e) { console.error("[notify]", e); }
}
