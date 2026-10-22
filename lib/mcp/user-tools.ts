/**
 * Outils du MCP « connecté » (/mcp/connect) : l'utilisateur a autorisé l'assistant depuis OMdotfun (OAuth),
 * l'assistant agit donc en son nom sans clé ni signature. Aucun mouvement d'argent : les paris et trades
 * passent par request_approval, que l'utilisateur confirme lui-même avec son wallet.
 */
import { TOOLS, ToolError, type McpTool } from "@/lib/mcp/tools";
import { ACTIONS, ActionError } from "@/lib/mcp/agent-actions";
import { createPost, type PostFile } from "@/lib/social/create-post";
import { getPublicProfile } from "@/services/profile-service";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/profiles";
import { UUID_RE } from "@/lib/social/posts";

const SIGNED_ONLY = new Set(["trade_prepare", "trade_submit", "create_post_prepare", "create_post", "agent_action_prepare", "agent_action", "launch_token_prepare", "launch_token_submit", "launch_token_confirm"]);

const S = (properties: Record<string, unknown>, required: string[] = []): McpTool["inputSchema"] => ({ type: "object", properties, required });
const ID = { type: "string", description: "Post uuid" };

const SCHEMAS: Record<string, McpTool["inputSchema"]> = {
  follow: S({ wallet: { type: "string", description: "Wallet to follow or unfollow" } }, ["wallet"]),
  like_post: S({ id: ID }, ["id"]),
  repost_post: S({ id: ID }, ["id"]),
  reply_post: S({ id: ID, body: { type: "string", maxLength: 1000 } }, ["id", "body"]),
  hide_post: S({ id: ID }, ["id"]),
  report_post: S({ id: ID, reason: { type: "string", maxLength: 300 } }, ["id"]),
  delete_post: S({ id: ID }, ["id"]),
  update_profile: S({
    display_name: { type: "string", maxLength: 40 },
    twitter_handle: { type: "string", maxLength: 16 },
    featured_token_id: { type: "string", description: "Token uuid launched on OMdotfun, or empty string to remove" },
    avatar_base64: { type: "string", description: "New profile picture, base64 (PNG/JPEG/WebP/GIF, max 2 MB)" },
    banner_base64: { type: "string", description: "New profile banner, base64 (PNG/JPEG/WebP/GIF, max 4 MB)" },
  }),
  request_approval: S({
    kind: { type: "string", enum: ["bet_pool", "buy_token", "sell_token"] },
    target_id: { type: "string", description: "Pool market uuid or token uuid" },
    amount: { type: "number" },
    option_id: { type: "string", description: "Required for bet_pool" },
  }, ["kind", "target_id", "amount"]),
};

function need(scopes: string[], scope: string) {
  if (!scopes.includes(scope)) throw new ToolError(`This connection does not allow it (missing permission: ${scope}). Reconnect OMdotfun and allow it.`);
}

const actionTools: McpTool[] = Object.entries(ACTIONS)
  .filter(([k]) => k !== "register")
  .map(([k, a]) => ({
    name: k,
    description: a.description + " Acts as the connected user.",
    readOnly: false,
    inputSchema: SCHEMAS[k] ?? S({}),
    run: async (args, ctx) => {
      if (!ctx.user) throw new ToolError("Not connected");
      need(ctx.user.scopes, k === "request_approval" ? "approvals" : "social");
      try { return await a.run(ctx.user.wallet, args, ctx); } catch (e) { if (e instanceof ActionError) throw new ToolError(e.message); throw e; }
    },
  }));

export const USER_TOOLS: McpTool[] = [
  {
    name: "my_profile",
    description: "The connected user's own OMdotfun profile: wallet, rank, win rate, earnings, tokens launched, markets created, recent activity.",
    readOnly: true,
    inputSchema: S({}),
    run: async (_a, ctx) => {
      if (!ctx.user) throw new ToolError("Not connected");
      const d = await getPublicProfile(ctx.user.wallet);
      return { address: ctx.user.wallet, ...d, activity: d.activity.slice(0, 20) };
    },
  },
  {
    name: "create_post",
    description: "Publish a post on the OMdotfun feed as the connected user: text up to 2000 characters and up to 2 images (JPG/PNG/WEBP/GIF, 5 MB max, base64). Mention $TICKER of a platform token to attach its chart, #tag for hashtags, @username to mention someone. Set quote_of to a post uuid to quote that post.",
    readOnly: false,
    inputSchema: S({
      body: { type: "string", maxLength: 2000 },
      images: { type: "array", maxItems: 2, items: { type: "object", properties: { mime: { type: "string" }, data: { type: "string", description: "base64" } }, required: ["mime", "data"] } },
      quote_of: { type: "string", description: "Post uuid to quote (optional)" },
    }),
    run: async (a, ctx) => {
      if (!ctx.user) throw new ToolError("Not connected");
      need(ctx.user.scopes, "social");
      const body = typeof a.body === "string" ? a.body : "";
      const raw = Array.isArray(a.images) ? a.images : [];
      if (raw.length > 2) throw new ToolError("Max 2 images");
      const files: PostFile[] = raw.map((x) => {
        const o = x as { mime?: unknown; data?: unknown };
        if (typeof o?.mime !== "string" || typeof o?.data !== "string") throw new ToolError("each image needs mime and data (base64)");
        const buf = Buffer.from(o.data, "base64");
        return { type: o.mime, size: buf.length, bytes: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer };
      });
      const q = typeof a.quote_of === "string" && a.quote_of ? a.quote_of : null;
      if (q && !UUID_RE.test(q)) throw new ToolError("quote_of must be a post uuid");
      const r = await createPost(ctx.user.wallet, body, files, { quoteOf: q });
      if (r.status >= 400) throw new ToolError(String(r.data.error ?? "Could not publish"));
      return r.data;
    },
  },
  {
    name: "list_notifications",
    description: "The connected user's latest notifications (up to 50): likes, replies, reposts, quotes, mentions and new followers, with who did it and an excerpt of the post. Set mark_read to true to mark them all as read.",
    readOnly: false,
    inputSchema: S({ unread_only: { type: "boolean" }, mark_read: { type: "boolean" } }),
    run: async (a, ctx) => {
      if (!ctx.user) throw new ToolError("Not connected");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;
      let q = admin.from("notifications").select("id, kind, actor, post_id, read, created_at").eq("wallet", ctx.user.wallet).order("created_at", { ascending: false }).limit(50);
      if (a.unread_only === true) q = q.eq("read", false);
      const { data } = await q;
      const rows = (data ?? []) as { id: string; kind: string; actor: string; post_id: string | null; read: boolean; created_at: string }[];
      const ids = [...new Set(rows.map((r) => r.post_id).filter(Boolean))] as string[];
      const [profiles, posts] = await Promise.all([
        getProfiles(admin, rows.map((r) => r.actor)),
        ids.length ? admin.from("posts").select("id, body, hidden").in("id", ids) : { data: [] },
      ]);
      const body = new Map<string, string>(((posts.data ?? []) as { id: string; body: string; hidden: boolean }[]).filter((p) => !p.hidden).map((p) => [p.id, p.body.slice(0, 200)]));
      if (a.mark_read === true) {
        need(ctx.user.scopes, "social");
        await admin.from("notifications").update({ read: true }).eq("wallet", ctx.user.wallet).eq("read", false);
      }
      return {
        notifications: rows.map((r) => ({ ...r, actor_name: profiles.get(r.actor)?.name ?? null, excerpt: r.post_id ? body.get(r.post_id) ?? null : null })),
      };
    },
  },
  {
    name: "search_users",
    description: "Find OMdotfun users by username prefix (without @). Returns wallet, username, display name and picture; use the wallet to follow or open a profile.",
    readOnly: true,
    inputSchema: S({ q: { type: "string", maxLength: 30 } }, ["q"]),
    run: async (a) => {
      const q = String(a.q ?? "").replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 30);
      if (!q) throw new ToolError("q is required");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (createAdminClient() as any).from("wallets").select("address, username, display_name, avatar_src")
        .or(`username.ilike.${q}%,display_name.ilike.${q}%`).limit(10);
      return { users: ((data ?? []) as { address: string; username: string | null; display_name: string | null; avatar_src: string | null }[]).map((u) => ({ wallet: u.address, username: u.username, name: u.display_name, avatar: u.avatar_src })) };
    },
  },
  ...actionTools,
  ...TOOLS.filter((t) => t.readOnly && !SIGNED_ONLY.has(t.name)),
];

export const USER_INSTRUCTIONS =
  "You are connected to the user's OMdotfun account (token launchpad on Solana and Arc + prediction markets). " +
  "You can read everything (including their notifications), post with images, quote, repost, reply, like, follow and edit the profile (name, X handle, picture, banner, featured token) in their name. " +
  "You cannot move money: to suggest a bet or a trade, call request_approval and give the user the returned link; they confirm with their own wallet.";
