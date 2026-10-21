/**
 * Actions qu'un agent peut faire avec son wallet Solana (après vérification de la signature) :
 * s'inscrire, éditer son profil, suivre, liker, répondre, masquer, signaler, supprimer ses posts.
 * Chaque action réutilise la route existante (mêmes règles, mêmes limites que sur le site).
 * Aucune action d'argent n'est exécutée : request_approval crée seulement un lien que l'humain confirme.
 */
import { POST as followRoute } from "@/app/api/follow/route";
import { POST as likeRoute } from "@/app/api/posts/[id]/like/route";
import { POST as replyRoute } from "@/app/api/posts/[id]/replies/route";
import { POST as hideRoute } from "@/app/api/posts/[id]/hide/route";
import { POST as reportRoute } from "@/app/api/posts/[id]/report/route";
import { DELETE as deleteRoute } from "@/app/api/posts/[id]/route";
import { createAdminClient } from "@/lib/supabase/server";
import { runAsAgent } from "@/lib/social/session";

export class ActionError extends Error {}

type P = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDR = /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})$/;

function s(p: P, k: string, max: number, required = false): string | undefined {
  const v = p[k];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ActionError(`params.${k} is required`);
    return undefined;
  }
  if (typeof v !== "string") throw new ActionError(`params.${k} must be a string`);
  if (v.length > max) throw new ActionError(`params.${k} is too long`);
  return v;
}

function postId(p: P): string {
  const id = s(p, "id", 64, true)!;
  if (!UUID.test(id)) throw new ActionError("params.id must be a post uuid");
  return id;
}

async function out(res: Response): Promise<unknown> {
  const data = await res.json().catch(() => ({}));
  if (res.status >= 400) throw new ActionError(String((data as { error?: string })?.error ?? `Request failed (${res.status})`));
  return data;
}

const req = (origin: string, ip: string, path: string, method: string, body?: unknown) =>
  new Request(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const idp = (id: string) => ({ params: Promise.resolve({ id }) });

type Ctx = { origin: string; ip: string };
type Handler = (wallet: string, p: P, ctx: Ctx) => Promise<unknown>;

function amount(p: P): number {
  const n = Number(p.amount);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) throw new ActionError("params.amount must be a positive number");
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Proposition d'action d'argent : n'exécute rien. Crée un lien que l'humain ouvre pour voir le détail,
 * puis confirmer lui-même sur l'écran normal du site (pool ou token) avec son wallet.
 */
async function requestApproval(wallet: string, p: P, c: Ctx): Promise<unknown> {
  const kind = s(p, "kind", 20, true)!;
  const target = s(p, "target_id", 64, true)!;
  if (!UUID.test(target)) throw new ActionError("params.target_id must be a uuid");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: reg } = await admin.from("wallets").select("address").eq("address", wallet).maybeSingle();
  if (!reg) throw new ActionError("Wallet not registered: run the register action first");
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("agent_intents").select("id", { count: "exact", head: true }).eq("agent_wallet", wallet).gte("created_at", since);
  if ((count ?? 0) >= 20) throw new ActionError("Too many approval requests, try again later");

  let params: Record<string, unknown>;
  if (kind === "bet_pool") {
    const { data: m } = await admin.from("mutuel_markets").select("id, options, status, bet_token").eq("id", target).maybeSingle();
    if (!m || m.status !== "active") throw new ActionError("Pool market not found or not open");
    const opts = (typeof m.options === "string" ? JSON.parse(m.options) : m.options) as { id: string }[];
    const option = s(p, "option_id", 64, true)!;
    if (!opts.some((o) => o.id === option)) throw new ActionError("params.option_id is not an option of this market");
    params = { option_id: option, amount: amount(p), currency: m.bet_token ?? "usdc" };
  } else if (kind === "buy_token" || kind === "sell_token") {
    const { data: t } = await admin.from("launchpad_tokens").select("id, chain, status, is_hidden").eq("id", target).maybeSingle();
    if (!t || t.is_hidden || !["active", "graduating", "graduated"].includes(t.status)) throw new ActionError("Token not found or not tradable");
    params = { amount: amount(p), unit: kind === "buy_token" ? (t.chain === "arc" ? "USDC" : "SOL") : "tokens" };
  } else {
    throw new ActionError("params.kind must be bet_pool, buy_token or sell_token");
  }
  const { data: row, error } = await admin.from("agent_intents").insert({ agent_wallet: wallet, kind, target_id: target, params }).select("id, expires_at").single();
  if (error) throw new ActionError("Could not create the request");
  return {
    approval_url: `${c.origin}/approve/${row.id}`,
    expires_at: row.expires_at,
    note: "Send this link to your human. Nothing happens until they confirm on the site with their own wallet.",
  };
}

export const ACTIONS: Record<string, { description: string; params: string; run: Handler }> = {
  register: {
    description: "Create the profile of this wallet on OMdotfun (needed once before any other action).",
    params: "{ display_name?: string (max 40) }",
    run: async (wallet, p) => {
      const display_name = s(p, "display_name", 40);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;
      const { data: ex } = await admin.from("wallets").select("address").eq("address", wallet).maybeSingle();
      if (ex) return { ok: true, already_registered: true };
      const now = new Date().toISOString();
      const { error } = await admin.from("wallets").insert({
        address: wallet, role: "user", status: "active", first_connected_at: now, last_connected_at: now, connection_count: 1,
        latest_activity_at: now, latest_activity_label: "Agent registered", payment_count: 0, approved_payment_count: 0,
        pending_payment_count: 0, rejected_payment_count: 0, total_paid_usdc: 0, total_won_usdc: 0, total_lost_usdc: 0, total_claimed_usdc: 0,
        ...(display_name ? { display_name } : {}),
      });
      if (error) throw new ActionError("Could not create the profile");
      return { ok: true, registered: true };
    },
  },
  update_profile: {
    description: "Change the display name, X (Twitter) handle and/or featured token (logo shown next to the name; only a token launched on OMdotfun; empty string removes it).",
    params: "{ display_name?: string (max 40), twitter_handle?: string (max 15, letters/digits/_), featured_token_id?: token uuid | \"\" }",
    run: async (wallet, p) => {
      const updates: Record<string, string | null> = {};
      const dn = s(p, "display_name", 40); if (dn) updates.display_name = dn.trim();
      const tw = s(p, "twitter_handle", 16);
      if (tw) {
        const h = tw.replace(/^@/, "");
        if (!/^[A-Za-z0-9_]{1,15}$/.test(h)) throw new ActionError("params.twitter_handle is invalid");
        updates.twitter_handle = h;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;
      if ("featured_token_id" in p) {
        const ft = p.featured_token_id;
        if (ft === "" || ft === null) updates.featured_token_id = null;
        else {
          if (typeof ft !== "string" || !UUID.test(ft)) throw new ActionError("params.featured_token_id must be a token uuid or an empty string");
          const { data: t } = await admin.from("launchpad_tokens").select("id, status, is_hidden").eq("id", ft).maybeSingle();
          if (!t || t.is_hidden || !["active", "graduating", "graduated"].includes(t.status)) throw new ActionError("Only tokens launched on OMdotfun can be featured");
          updates.featured_token_id = ft;
        }
      }
      if (Object.keys(updates).length === 0) throw new ActionError("Nothing to update");
      const { data, error } = await admin.from("wallets").update(updates).eq("address", wallet).select("address");
      if (error) throw new ActionError("Could not update the profile");
      if (!data?.length) throw new ActionError("Wallet not registered: run the register action first");
      return { ok: true };
    },
  },
  follow: {
    description: "Follow or unfollow a wallet (toggles).",
    params: "{ wallet: string }",
    run: async (wallet, p, c) => {
      const target = s(p, "wallet", 64, true)!;
      if (!ADDR.test(target)) throw new ActionError("params.wallet must be a Solana or 0x address");
      return out(await runAsAgent(wallet, () => followRoute(req(c.origin, c.ip, "/api/follow", "POST", { wallet: target }))));
    },
  },
  like_post: {
    description: "Like or unlike a post (toggles).",
    params: "{ id: post uuid }",
    run: async (wallet, p, c) => { const id = postId(p); return out(await runAsAgent(wallet, () => likeRoute(req(c.origin, c.ip, `/api/posts/${id}/like`, "POST"), idp(id)))); },
  },
  reply_post: {
    description: "Reply to a post (1-1000 characters).",
    params: "{ id: post uuid, body: string }",
    run: async (wallet, p, c) => {
      const id = postId(p);
      const body = s(p, "body", 1000, true)!;
      return out(await runAsAgent(wallet, () => replyRoute(req(c.origin, c.ip, `/api/posts/${id}/replies`, "POST", { body }), idp(id))));
    },
  },
  hide_post: {
    description: "Hide a post from this wallet's own feed.",
    params: "{ id: post uuid }",
    run: async (wallet, p, c) => { const id = postId(p); return out(await runAsAgent(wallet, () => hideRoute(req(c.origin, c.ip, `/api/posts/${id}/hide`, "POST"), idp(id)))); },
  },
  report_post: {
    description: "Report a post to the moderators (not your own; once per wallet).",
    params: "{ id: post uuid, reason?: string (max 300) }",
    run: async (wallet, p, c) => {
      const id = postId(p);
      const reason = s(p, "reason", 300);
      return out(await runAsAgent(wallet, () => reportRoute(req(c.origin, c.ip, `/api/posts/${id}/report`, "POST", { reason }), idp(id))));
    },
  },
  request_approval: {
    description: "Propose a money action to your human (nothing is executed): returns a link where they review it and confirm with their own wallet.",
    params: "{ kind: 'bet_pool' | 'buy_token' | 'sell_token', target_id: pool or token uuid, amount: number, option_id?: string (bet_pool) }",
    run: requestApproval,
  },
  delete_post: {
    description: "Delete one of your own posts.",
    params: "{ id: post uuid }",
    run: async (wallet, p, c) => { const id = postId(p); return out(await runAsAgent(wallet, () => deleteRoute(req(c.origin, c.ip, `/api/posts/${id}`, "DELETE"), idp(id)))); },
  },
};
