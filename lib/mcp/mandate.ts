/**
 * Programme confié à une IA (jusqu'à 31 jours) : la personne qui l'a connectée décrit ce que l'IA doit faire,
 * l'IA le suit seule, sans validation à chaque action. Limites : durée, nombre de marchés créés (frais offerts),
 * et toutes les limites habituelles du site (posts par heure, modération). L'argent ne bouge jamais sans l'humain.
 */
import { createAdminClient } from "@/lib/supabase/server";
import { createPoolMarket } from "@/lib/market/create-pool";
import { moderateText } from "@/lib/moderation";
import { rateHit } from "@/lib/rate-limit";
import type { requestPoolMarket } from "@/lib/mcp/pool-create";

export class MandateError extends Error {}
type P = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

export type Mandate = { id: string; brief: string; starts_at: string; ends_at: string; max_markets: number };

export async function activeMandate(wallet: string): Promise<Mandate | null> {
  const now = new Date().toISOString();
  const { data } = await db().from("ai_mandates").select("id, brief, starts_at, ends_at, max_markets")
    .eq("wallet", wallet).eq("revoked", false).lte("starts_at", now).gt("ends_at", now).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as Mandate) ?? null;
}

async function marketsUsed(m: Mandate): Promise<number> {
  const { count } = await db().from("mutuel_markets").select("id", { count: "exact", head: true }).like("creation_tx", `mandate:${m.id}:%`);
  return count ?? 0;
}

export async function setProgram(wallet: string, p: P) {
  const brief = typeof p.brief === "string" ? p.brief.trim() : "";
  if (brief.length < 20 || brief.length > 4000) throw new MandateError("params.brief must be 20 to 4000 characters: describe what the AI must do, how often, and what it must never do");
  const days = Math.round(Number(p.days ?? 30));
  if (!Number.isFinite(days) || days < 1 || days > 31) throw new MandateError("params.days must be between 1 and 31");
  const maxMarkets = Math.round(Number(p.max_markets ?? 0));
  if (!Number.isFinite(maxMarkets) || maxMarkets < 0 || maxMarkets > 30) throw new MandateError("params.max_markets must be between 0 and 30");
  if (!(await rateHit(`mandate:${wallet}`, 5, 3600_000))) throw new MandateError("Too many changes, try again later");
  if ((await moderateText(brief)) === "blocked") throw new MandateError("This program goes against our rules");
  await db().from("ai_mandates").update({ revoked: true }).eq("wallet", wallet).eq("revoked", false);
  const ends = new Date(Date.now() + days * 86400_000).toISOString();
  const { data, error } = await db().from("ai_mandates").insert({ wallet, brief, ends_at: ends, max_markets: maxMarkets }).select("id").single();
  if (error) throw new MandateError("Could not save the program");
  return { ok: true, id: data.id, ends_at: ends, max_markets: maxMarkets, note: "From now on you follow this program on your own, without asking for approval at each step. Money still never moves without your human." };
}

export async function getProgram(wallet: string) {
  const m = await activeMandate(wallet);
  if (!m) return { active: false, note: "No program. Ask your human to describe one, then call set_program." };
  const used = await marketsUsed(m);
  return { active: true, brief: m.brief, ends_at: m.ends_at, days_left: Math.max(0, Math.ceil((new Date(m.ends_at).getTime() - Date.now()) / 86400_000)), markets_left: Math.max(0, m.max_markets - used) };
}

export async function endProgram(wallet: string) {
  await db().from("ai_mandates").update({ revoked: true }).eq("wallet", wallet).eq("revoked", false);
  return { ok: true };
}

/** Création directe d'un marché sous programme actif : frais offerts, publié tout de suite, textes et images modérés. Retourne null si non éligible. */
export async function createUnderMandate(wallet: string, draft: Awaited<ReturnType<typeof requestPoolMarket>> extends never ? never : P & { title: string; options: { label: string; image_url: string | null }[]; cover_image: string | null; description: string; category: string; betting_closes_at: string; bet_token: string; match_key?: string | null }, origin: string) {
  // Frais offerts seulement pour les comptes de la maison (OMERO_WALLETS) : sinon n'importe qui inonderait le site de marchés gratuits
  const free = (process.env.OMERO_WALLETS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!free.includes(wallet.toLowerCase())) return null;
  const m = await activeMandate(wallet);
  if (!m || (await marketsUsed(m)) >= m.max_markets) return null;
  const text = [draft.title, draft.description, ...draft.options.map((o) => o.label)].join("\n");
  if ((await moderateText(text)) === "blocked") throw new MandateError("This market goes against our rules");
  const res = await createPoolMarket(wallet, {
    title: draft.title, description: draft.description || null, cover_image_src: draft.cover_image, options: draft.options,
    category: draft.category, betting_closes_at: draft.betting_closes_at, bet_token: draft.bet_token, match_key: draft.match_key ?? null,
  }, { mandateId: m.id });
  const j = (await res.json().catch(() => ({}))) as { id?: string; slug?: string; error?: string };
  if (res.status >= 400) throw new MandateError(j.error ?? `Request failed (${res.status})`);
  return { ok: true, id: j.id, slug: j.slug, status: "active", url: `${origin}/pools/${j.slug}`, note: "Created under your program (fee covered, live now). Share it with create_post by putting the url in the text." };
}
