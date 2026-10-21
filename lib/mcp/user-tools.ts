/**
 * Outils du MCP « connecté » (/mcp/connect) : l'utilisateur a autorisé l'assistant depuis OMdotfun (OAuth),
 * l'assistant agit donc en son nom sans clé ni signature. Aucun mouvement d'argent : les paris et trades
 * passent par request_approval, que l'utilisateur confirme lui-même avec son wallet.
 */
import { TOOLS, ToolError, type McpTool } from "@/lib/mcp/tools";
import { ACTIONS, ActionError } from "@/lib/mcp/agent-actions";
import { createPost, type PostFile } from "@/lib/social/create-post";
import { getPublicProfile } from "@/services/profile-service";

const SIGNED_ONLY = new Set(["trade_prepare", "trade_submit", "create_post_prepare", "create_post", "agent_action_prepare", "agent_action", "launch_token_prepare", "launch_token_submit", "launch_token_confirm"]);

const S = (properties: Record<string, unknown>, required: string[] = []): McpTool["inputSchema"] => ({ type: "object", properties, required });
const ID = { type: "string", description: "Post uuid" };

const SCHEMAS: Record<string, McpTool["inputSchema"]> = {
  follow: S({ wallet: { type: "string", description: "Wallet to follow or unfollow" } }, ["wallet"]),
  like_post: S({ id: ID }, ["id"]),
  reply_post: S({ id: ID, body: { type: "string", maxLength: 1000 } }, ["id", "body"]),
  hide_post: S({ id: ID }, ["id"]),
  report_post: S({ id: ID, reason: { type: "string", maxLength: 300 } }, ["id"]),
  delete_post: S({ id: ID }, ["id"]),
  update_profile: S({
    display_name: { type: "string", maxLength: 40 },
    twitter_handle: { type: "string", maxLength: 16 },
    featured_token_id: { type: "string", description: "Token uuid launched on OMdotfun, or empty string to remove" },
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
    description: "Publish a post on the OMdotfun feed as the connected user: text up to 2000 characters and up to 2 images (JPG/PNG/WEBP/GIF, 5 MB max, base64). Mention $TICKER of a platform token to attach its chart.",
    readOnly: false,
    inputSchema: S({
      body: { type: "string", maxLength: 2000 },
      images: { type: "array", maxItems: 2, items: { type: "object", properties: { mime: { type: "string" }, data: { type: "string" } }, required: ["mime", "data"] } },
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
      const r = await createPost(ctx.user.wallet, body, files);
      if (r.status >= 400) throw new ToolError(String(r.data.error ?? "Could not publish"));
      return r.data;
    },
  },
  ...actionTools,
  ...TOOLS.filter((t) => t.readOnly && !SIGNED_ONLY.has(t.name)),
];

export const USER_INSTRUCTIONS =
  "You are connected to the user's OMdotfun account (token launchpad on Solana and Arc + prediction markets). " +
  "You can read everything, post, reply, like, follow and edit the profile in their name. " +
  "You cannot move money: to suggest a bet or a trade, call request_approval and give the user the returned link; they confirm with their own wallet.";
