/**
 * Outils exposés aux agents IA par le serveur MCP d'OMdotfun (/mcp).
 *
 * Tous les outils réutilisent les routes et services existants (mêmes vérifications, mêmes limites).
 * Le serveur ne détient JAMAIS de clé : le lancement d'un token renvoie des transactions que l'agent
 * signe lui-même avec sa propre clé, puis renvoie signées.
 */
import { GET as getTrending } from "@/app/api/launchpad/trending/route";
import { GET as listTokensRoute } from "@/app/api/launchpad/tokens/route";
import { GET as listPoolsRoute } from "@/app/api/pools/route";
import { GET as getPoolRoute } from "@/app/api/pools/[id]/route";
import { GET as updownMarketsRoute } from "@/app/api/updown/markets/route";
import { GET as trendingMarketsRoute } from "@/app/api/markets/trending/route";
import { GET as creatorsLeaderboardRoute } from "@/app/api/leaderboard/route";
import { GET as creatorSummaryRoute } from "@/app/api/v1/creators/[address]/summary/route";
import { GET as listPostsRoute } from "@/app/api/posts/route";
import { GET as postRepliesRoute } from "@/app/api/posts/[id]/replies/route";
import { GET as followRoute } from "@/app/api/follow/route";
import { POST as launchRoute } from "@/app/api/v1/launch/route";
import { POST as launchSubmitRoute } from "@/app/api/v1/launch/[id]/submit/route";
import { POST as launchConfirmRoute } from "@/app/api/v1/launch/[id]/confirm/route";
import { createPost, type PostFile } from "@/lib/social/create-post";
import { postMessage, verifyPostSignature, type B64Image } from "@/lib/mcp/post-auth";
import { fetchImage, ImageUrlError } from "@/lib/mcp/fetch-image";
import { ACTIONS, ActionError } from "@/lib/mcp/agent-actions";
import { actionMessage, verifyAction, isEvm, isSolana, normAgentWallet } from "@/lib/mcp/agent-auth";
import { prepareTrade, submitTrade, TradeError, MAX_BUY_SOL, MAX_BUY_USDC } from "@/lib/mcp/trade";
import { getLaunchpadToken } from "@/services/launchpad-service";
import { getPublicProfile } from "@/services/profile-service";

export type ToolCtx = { origin: string; ip: string; user?: { wallet: string; scopes: string[] } };

type Json = Record<string, unknown>;

export type McpTool = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  /** true = lecture seule */
  readOnly: boolean;
  run: (args: Json, ctx: ToolCtx) => Promise<unknown>;
};

class ToolError extends Error {}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADDR = /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(a: Json, k: string, opts?: { required?: boolean; max?: number }): string | undefined {
  const v = a[k];
  if (v === undefined || v === null || v === "") {
    if (opts?.required) throw new ToolError(`${k} is required`);
    return undefined;
  }
  if (typeof v !== "string") throw new ToolError(`${k} must be a string`);
  if (v.length > (opts?.max ?? 2000)) throw new ToolError(`${k} is too long`);
  return v;
}

function num(a: Json, k: string, def: number, min: number, max: number): number {
  const v = a[k];
  if (v === undefined || v === null) return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ToolError(`${k} must be a number`);
  return Math.min(max, Math.max(min, n));
}

async function readJson(res: Response): Promise<{ status: number; data: unknown }> {
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function okJson(res: Response): Promise<unknown> {
  const { status, data } = await readJson(res);
  if (status >= 400) throw new ToolError(String((data as Json)?.error ?? `Request failed (${status})`));
  return data;
}

function get(ctx: ToolCtx, path: string): Request {
  return new Request(`${ctx.origin}${path}`, { headers: { "x-forwarded-for": ctx.ip } });
}

function post(ctx: ToolCtx, path: string, body: unknown): Request {
  return new Request(`${ctx.origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ctx.ip },
    body: JSON.stringify(body),
  });
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

function postInputSchema(withSig: boolean): McpTool["inputSchema"] {
  return {
    type: "object",
    properties: {
      wallet: { type: "string", description: "Wallet of the author (Solana or Arc 0x…), the signer" },
      body: { type: "string", maxLength: 2000, description: "Post text (may be empty if there is an image)" },
      images: {
        type: "array", maxItems: 2,
        items: { type: "object", properties: { mime: { type: "string", enum: ["image/jpeg", "image/png", "image/webp", "image/gif"] }, data: { type: "string", description: "base64, max 5 MB" } }, required: ["mime", "data"] },
      },
      image_urls: { type: "array", maxItems: 2, items: { type: "string" }, description: "Public https links to images (alternative to base64; at most 2 images in total). Covered by the signature." },
      ...(withSig ? { timestamp: { type: "integer", description: "From create_post_prepare" }, signature: { type: "string", description: "signature of the message: base64 (Solana) or 0x hex personal_sign (Arc)" } } : {}),
    },
    required: withSig ? ["wallet", "timestamp", "signature"] : ["wallet"],
  };
}

function actionSchema(withSig: boolean): McpTool["inputSchema"] {
  return {
    type: "object",
    properties: {
      wallet: { type: "string", description: "Wallet of the agent (Solana or Arc 0x…), the signer" },
      action: { type: "string", enum: Object.keys(ACTIONS) },
      params: { type: "object", description: "Parameters of the action (see the tool description)" },
      ...(withSig ? { timestamp: { type: "integer", description: "From agent_action_prepare" }, signature: { type: "string", description: "signature of the message: base64 (Solana) or 0x hex personal_sign (Arc)" } } : {}),
    },
    required: withSig ? ["wallet", "action", "timestamp", "signature"] : ["wallet", "action"],
  };
}

function readActionArgs(a: Json): { wallet: string; action: string; params: Json } {
  const wallet = str(a, "wallet", { required: true, max: 64 })!;
  if (!isSolana(wallet) && !isEvm(wallet)) throw new ToolError("wallet must be a Solana or Arc (0x) address");
  const action = str(a, "action", { required: true, max: 40 })!;
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) throw new ToolError(`unknown action (use one of: ${Object.keys(ACTIONS).join(", ")})`);
  const params = a.params ?? {};
  if (typeof params !== "object" || Array.isArray(params) || params === null) throw new ToolError("params must be an object");
  return { wallet: normAgentWallet(wallet), action, params: params as Json };
}

function readPostArgs(a: Json): { wallet: string; body: string; images: B64Image[]; imageUrls: string[] } {
  const wallet = str(a, "wallet", { required: true, max: 64 })!;
  if (!isSolana(wallet) && !isEvm(wallet)) throw new ToolError("wallet must be a Solana or Arc (0x) address");
  const body = str(a, "body", { max: 2000 }) ?? "";
  const raw = a.images ?? [];
  if (!Array.isArray(raw) || raw.length > 2) throw new ToolError("images must be an array of at most 2");
  const images: B64Image[] = raw.map((x) => {
    const o = x as Json;
    if (typeof o?.mime !== "string" || typeof o?.data !== "string") throw new ToolError("each image needs mime and data (base64)");
    if (o.data.length > 7_200_000) throw new ToolError("Image too large (max 5 MB)");
    return { mime: o.mime, data: o.data };
  });
  const rawUrls = a.image_urls ?? [];
  if (!Array.isArray(rawUrls)) throw new ToolError("image_urls must be an array");
  const imageUrls = rawUrls.map((u) => { if (typeof u !== "string" || !u.startsWith("https://") || u.length > 2000) throw new ToolError("each image url must be an https:// link"); return u; });
  if (images.length + imageUrls.length > 2) throw new ToolError("Max 2 images");
  if (!body.trim() && images.length === 0 && imageUrls.length === 0) throw new ToolError("Empty post");
  return { wallet: normAgentWallet(wallet), body, images, imageUrls };
}

// ── Outils ────────────────────────────────────────────────────────────────────

export const TOOLS: McpTool[] = [
  {
    name: "get_trending_tokens",
    description: "Top tokens on the OMdotfun launchpad by 24h volume (Solana and Arc).",
    readOnly: true,
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 20, description: "Default 10" } } },
    run: async (a, ctx) => okJson(await getTrending(get(ctx, `/api/launchpad/trending?limit=${num(a, "limit", 10, 1, 20)}`))),
  },
  {
    name: "list_tokens",
    description: "List launchpad tokens with filters and pagination.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        sort: { type: "string", enum: ["new", "old", "verified", "market_cap_desc", "market_cap_asc", "volume"] },
        chain: { type: "string", enum: ["solana", "arc"] },
        search: { type: "string", description: "Name or ticker" },
        page: { type: "integer", minimum: 0, description: "0-based" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
    run: async (a, ctx) => {
      const q = new URLSearchParams();
      const sort = str(a, "sort", { max: 30 }); if (sort) q.set("sort", sort);
      const chain = str(a, "chain", { max: 10 }); if (chain) q.set("chain", chain);
      const search = str(a, "search", { max: 80 }); if (search) q.set("search", search);
      q.set("page", String(num(a, "page", 0, 0, 1000)));
      q.set("limit", String(num(a, "limit", 20, 1, 50)));
      return okJson(await listTokensRoute(get(ctx, `/api/launchpad/tokens?${q}`)));
    },
  },
  {
    name: "get_token",
    description: "Details of one launchpad token by its id (uuid): price, market cap, volume, creator, links.",
    readOnly: true,
    inputSchema: { type: "object", properties: { id: { type: "string", description: "Token uuid" } }, required: ["id"] },
    run: async (a) => {
      const id = str(a, "id", { required: true, max: 64 })!;
      if (!UUID.test(id)) throw new ToolError("id must be a token uuid");
      const t = await getLaunchpadToken(id);
      if (!t) throw new ToolError("Token not found");
      return t;
    },
  },
  {
    name: "list_pool_markets",
    description: "Open prediction pool markets (parimutuel): options, pool size, closing time, status.",
    readOnly: true,
    inputSchema: { type: "object", properties: {} },
    run: async (_a, ctx) => {
      const data = (await okJson(await listPoolsRoute())) as unknown;
      const rows = Array.isArray(data) ? data : ((data as Json)?.markets as unknown[] | undefined) ?? [];
      return (rows as Json[]).filter((m) => m.status === "active" || m.status === "closed");
    },
  },
  {
    name: "get_pool_market",
    description: "One prediction pool market by uuid.",
    readOnly: true,
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: async (a, ctx) => {
      const id = str(a, "id", { required: true, max: 64 })!;
      return okJson(await getPoolRoute(get(ctx, `/api/pools/${id}`), idParams(id)));
    },
  },
  {
    name: "list_updown_markets",
    description: "Open Up/Down rounds (will the price go up or down) for a symbol, plus the latest resolved ones.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", enum: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "PEPEUSDT", "DOGEUSDT"] } },
      required: ["symbol"],
    },
    run: async (a, ctx) => {
      const symbol = str(a, "symbol", { required: true, max: 12 })!;
      return okJson(await updownMarketsRoute(get(ctx, `/api/updown/markets?symbol=${encodeURIComponent(symbol)}`)));
    },
  },
  {
    name: "get_trending_markets",
    description: "Trending prediction markets by volume.",
    readOnly: true,
    inputSchema: { type: "object", properties: {} },
    run: async () => okJson(await trendingMarketsRoute()),
  },
  {
    name: "get_profile",
    description: "Public profile of a wallet (Solana or Arc/0x): rank, win rate, total earned in USD, created tokens and markets, recent activity.",
    readOnly: true,
    inputSchema: { type: "object", properties: { wallet: { type: "string" } }, required: ["wallet"] },
    run: async (a) => {
      const w = str(a, "wallet", { required: true, max: 64 })!;
      if (!ADDR.test(w)) throw new ToolError("wallet must be a Solana or 0x address");
      const data = await getPublicProfile(w.startsWith("0x") ? w.toLowerCase() : w);
      return { ...data, activity: data.activity.slice(0, 20) };
    },
  },
  {
    name: "list_posts",
    description: "Public feed posts (newest first): text, image URLs, author, likes, replies, views, and the token ticker if the post mentions one (author_octo: OMERO total of the author, 1,000+ = verification badge). Optionally only the posts of one wallet.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        author: { type: "string", description: "Wallet address (Solana or 0x) to list only its posts" },
        before: { type: "string", description: "ISO date: only posts older than this (pagination, use the last created_at)" },
        limit: { type: "integer", minimum: 1, maximum: 30, description: "Default 10" },
      },
    },
    run: async (a, ctx) => {
      const q = new URLSearchParams({ tab: "foryou", limit: String(num(a, "limit", 10, 1, 30)) });
      const author = str(a, "author", { max: 64 });
      if (author) {
        if (!ADDR.test(author)) throw new ToolError("author must be a Solana or 0x address");
        q.set("author", author);
      }
      const before = str(a, "before", { max: 40 });
      if (before) q.set("before", before);
      return okJson(await listPostsRoute(get(ctx, `/api/posts?${q}`)));
    },
  },
  {
    name: "get_post_replies",
    description: "Replies to one feed post (by post uuid), oldest first. author_octo is the author's OMERO total: 1,000 or more means they have the verification badge.",
    readOnly: true,
    inputSchema: { type: "object", properties: { id: { type: "string", description: "Post uuid" } }, required: ["id"] },
    run: async (a, ctx) => {
      const id = str(a, "id", { required: true, max: 64 })!;
      if (!UUID.test(id)) throw new ToolError("id must be a post uuid");
      return okJson(await postRepliesRoute(get(ctx, `/api/posts/${id}/replies`), idParams(id)));
    },
  },
  {
    name: "get_follow_stats",
    description: "Followers and following counts of a wallet.",
    readOnly: true,
    inputSchema: { type: "object", properties: { wallet: { type: "string" } }, required: ["wallet"] },
    run: async (a, ctx) => {
      const w = str(a, "wallet", { required: true, max: 64 })!;
      if (!ADDR.test(w)) throw new ToolError("wallet must be a Solana or 0x address");
      const d = (await okJson(await followRoute(get(ctx, `/api/follow?wallet=${encodeURIComponent(w)}`)))) as Json;
      return { followers: d.followers, following: d.following };
    },
  },
  {
    name: "get_creator_summary",
    description: "Creator earnings summary for a wallet: tokens launched and fees earned/claimable.",
    readOnly: true,
    inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
    run: async (a, ctx) => {
      const addr = str(a, "address", { required: true, max: 64 })!;
      if (!ADDR.test(addr)) throw new ToolError("address must be a Solana or 0x address");
      return okJson(await creatorSummaryRoute(get(ctx, `/api/v1/creators/${addr}/summary`), { params: Promise.resolve({ address: addr }) } as never));
    },
  },
  {
    name: "get_creators_leaderboard",
    description: "Leaderboard of top creators by fees earned.",
    readOnly: true,
    inputSchema: { type: "object", properties: { period: { type: "string", enum: ["24h", "7d", "30d", "all"] } } },
    run: async (a, ctx) => {
      const period = str(a, "period", { max: 6 });
      return okJson(await creatorsLeaderboardRoute(get(ctx, `/api/leaderboard${period ? `?period=${encodeURIComponent(period)}` : ""}`)));
    },
  },

  // ── Publier un post (Solana) — non custodial : l'agent signe un message avec son wallet ──
  {
    name: "create_post_prepare",
    description:
      "Step 1/2 of publishing a feed post as a Solana or Arc wallet: returns the exact message to sign (ed25519 for Solana, personal_sign / EIP-191 for Arc) and the timestamp. Nothing is published yet. Text up to 2000 chars, optionally up to 2 images (JPG/PNG/WEBP/GIF, max 5 MB each), as base64 or as public https links (image_urls). Mention $TICKER of a platform token to attach its chart.",
    readOnly: true,
    inputSchema: postInputSchema(false),
    run: async (a) => {
      const { wallet, body, images, imageUrls } = readPostArgs(a);
      const timestamp = Date.now();
      return { message: postMessage(wallet, timestamp, body, images, imageUrls), timestamp, next: "Sign the message bytes (UTF-8) with the wallet key, then call create_post with the same wallet/body/images/image_urls, this timestamp and the base64 signature. Valid for 5 minutes, single use." };
    },
  },
  {
    name: "create_post",
    description: "Step 2/2: publish the post. Requires the same wallet/body/images as create_post_prepare, its timestamp, and the signature of the message (base64 for Solana, 0x… hex for Arc). The wallet must already have a profile on OMdotfun. Limit: 10 posts per hour per wallet.",
    readOnly: false,
    inputSchema: postInputSchema(true),
    run: async (a) => {
      const { wallet, body, images, imageUrls } = readPostArgs(a);
      const timestamp = Number(a.timestamp);
      const signature = str(a, "signature", { required: true, max: 200 })!;
      const bad = await verifyPostSignature(wallet, timestamp, body, images, signature, imageUrls);
      if (bad) throw new ToolError(bad);
      const files: PostFile[] = images.map((im) => {
        const buf = Buffer.from(im.data, "base64");
        return { type: im.mime, size: buf.length, bytes: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer };
      });
      for (const link of imageUrls) {
        try {
          const { buf, mime } = await fetchImage(link, 5 * 1024 * 1024);
          files.push({ type: mime, size: buf.length, bytes: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer });
        } catch (e) { if (e instanceof ImageUrlError) throw new ToolError(e.message); throw e; }
      }
      const r = await createPost(wallet, body, files);
      if (r.status >= 400) throw new ToolError(String(r.data.error ?? `Request failed (${r.status})`));
      return r.data;
    },
  },

  // ── Actions d'un agent (Solana) : s'inscrire, profil, suivre, liker, répondre, signaler... ──
  {
    name: "agent_action_prepare",
    description:
      "Step 1/2 of any signed action as a Solana or Arc wallet. Returns the exact message to sign (ed25519 for Solana, personal_sign / EIP-191 for Arc) and a timestamp; nothing is executed. Available actions: " +
      Object.entries(ACTIONS).map(([k, v]) => `${k} ${v.params} — ${v.description}`).join(" | "),
    readOnly: true,
    inputSchema: actionSchema(false),
    run: async (a) => {
      const { wallet, action, params } = readActionArgs(a);
      const timestamp = Date.now();
      return { message: actionMessage(action, wallet, timestamp, params), timestamp, next: "Sign the message (UTF-8 bytes) with the wallet key, then call agent_action with the same wallet/action/params, this timestamp and the base64 signature. Valid for 5 minutes, single use." };
    },
  },
  {
    name: "agent_action",
    description: "Step 2/2: execute the action after verifying the wallet's signature. Same arguments as agent_action_prepare plus the timestamp and the signature (base64 for Solana, 0x hex for Arc). Run the `register` action first for a new wallet. No money moves through this tool: request_approval only returns a link that a human reviews and confirms with their own wallet.",
    readOnly: false,
    inputSchema: actionSchema(true),
    run: async (a, ctx) => {
      const { wallet, action, params } = readActionArgs(a);
      const bad = await verifyAction(action, wallet, Number(a.timestamp), params, str(a, "signature", { required: true, max: 200 })!);
      if (bad) throw new ToolError(bad);
      try {
        return await ACTIONS[action].run(wallet, params, ctx);
      } catch (e) {
        if (e instanceof ActionError) throw new ToolError(e.message);
        throw e;
      }
    },
  },

  // ── Trading de tokens OMdotfun (non custodial : l'agent signe avec sa propre clé) ──
  {
    name: "trade_prepare",
    description:
      `Buy or sell a token launched on OMdotfun with your own wallet. Returns the transaction(s) to sign plus the price estimate. ` +
      `Solana tokens on the bonding curve (pay in SOL, max ${MAX_BUY_SOL} SOL per buy) and Arc V2 tokens on the bonding curve (pay in USDC, max ${MAX_BUY_USDC} USDC per buy). ` +
      `amount = SOL/USDC to spend for a buy, number of tokens for a sell. Default slippage 1% (max 10%). Graduated tokens trade on DEXs. 30 trades per hour per wallet.`,
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string", description: "Your wallet (Solana for Solana tokens, 0x for Arc tokens), the signer" },
        token_id: { type: "string", description: "Token uuid (see list_tokens / get_token)" },
        side: { type: "string", enum: ["buy", "sell"] },
        amount: { type: "number" },
        slippage_bps: { type: "integer", minimum: 10, maximum: 1000 },
      },
      required: ["wallet", "token_id", "side", "amount"],
    },
    run: async (a) => {
      const id = str(a, "token_id", { required: true, max: 64 })!;
      if (!UUID.test(id)) throw new ToolError("token_id must be a token uuid");
      const wallet = str(a, "wallet", { required: true, max: 64 })!;
      try {
        return await prepareTrade({ wallet, token_id: id, side: str(a, "side", { required: true, max: 4 }) as "buy" | "sell", amount: Number(a.amount), slippage_bps: a.slippage_bps === undefined ? undefined : Number(a.slippage_bps) });
      } catch (e) { if (e instanceof TradeError) throw new ToolError(e.message); throw e; }
    },
  },
  {
    name: "trade_submit",
    description: "Broadcast a trade you signed (from trade_prepare). Solana: { chain: \"solana\", signed_tx_base64 }. Arc: { chain: \"arc\", signed_tx } (0x serialized), one call per transaction, in order. Only OMdotfun bonding-curve trades are accepted.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: { chain: { type: "string", enum: ["solana", "arc"] }, signed_tx_base64: { type: "string" }, signed_tx: { type: "string" } },
      required: ["chain"],
    },
    run: async (a) => {
      try {
        return await submitTrade({ chain: str(a, "chain", { required: true, max: 10 })!, signed_tx_base64: str(a, "signed_tx_base64", { max: 20_000 }), signed_tx: str(a, "signed_tx", { max: 40_000 }) });
      } catch (e) { if (e instanceof TradeError) throw new ToolError(e.message); throw e; }
    },
  },

  // ── Lancement de token (Solana) — non custodial : l'agent signe lui-même ──────
  {
    name: "launch_token_prepare",
    description:
      "Step 1 of launching a Solana token. Creates the token and returns two unsigned transactions (tx_a, tx_b). " +
      "The agent must sign each with its own wallet key (partialSign, keeping existing signatures) — OMdotfun never holds keys. " +
      "Blockhashes expire in ~60s. Rate limited: 3 launches/wallet/hour.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string", description: "Creator Solana wallet (the signer)" },
        name: { type: "string", maxLength: 32 },
        ticker: { type: "string", description: "2-10 letters/digits" },
        description: { type: "string", maxLength: 1000 },
        category: { type: "string", enum: ["Meme", "Utility", "AI", "Gaming", "DeFi", "NFT", "x402"] },
        logo_base64: { type: "string", description: "PNG/JPEG/WebP/GIF, max 5 MB" },
        logo_mime: { type: "string", enum: ["image/png", "image/jpeg", "image/webp", "image/gif"] },
        website: { type: "string" }, twitter: { type: "string" }, telegram: { type: "string" },
        first_buy_sol: { type: "number", minimum: 0, maximum: 100, description: "Optional first buy by the creator, in SOL" },
      },
      required: ["wallet", "name", "ticker"],
    },
    run: async (a, ctx) => {
      const wallet = str(a, "wallet", { required: true, max: 64 })!;
      if (!SOLANA.test(wallet)) throw new ToolError("wallet must be a valid Solana address");
      const body: Json = { wallet };
      for (const k of ["name", "ticker", "description", "category", "logo_base64", "logo_mime", "website", "twitter", "telegram"]) {
        const v = str(a, k, { max: k === "logo_base64" ? 8_000_000 : 2000 });
        if (v !== undefined) body[k] = v;
      }
      if (a.first_buy_sol !== undefined) body.first_buy_sol = num(a, "first_buy_sol", 0, 0, 100);
      return okJson(await launchRoute(post(ctx, "/api/v1/launch", body)));
    },
  },
  {
    name: "launch_token_submit",
    description:
      "Step 2/3 of launching a token. Send the signed transaction for step 'a' (mint + fee) first, then 'b' (liquidity pool). " +
      "Returns the on-chain signature; use the signature of step 'b' in launch_token_confirm.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        token_id: { type: "string" },
        wallet: { type: "string" },
        step: { type: "string", enum: ["a", "b"] },
        signed_tx_base64: { type: "string" },
      },
      required: ["token_id", "wallet", "step", "signed_tx_base64"],
    },
    run: async (a, ctx) => {
      const id = str(a, "token_id", { required: true, max: 64 })!;
      if (!UUID.test(id)) throw new ToolError("token_id must be a uuid");
      const body = {
        wallet: str(a, "wallet", { required: true, max: 64 }),
        step: str(a, "step", { required: true, max: 1 }),
        signed_tx_base64: str(a, "signed_tx_base64", { required: true, max: 20_000 }),
      };
      return okJson(await launchSubmitRoute(post(ctx, `/api/v1/launch/${id}/submit`, body), idParams(id)));
    },
  },
  {
    name: "launch_token_confirm",
    description: "Step 3/3 of launching a token: confirm with the signature of step 'b'. Makes the token live.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: { token_id: { type: "string" }, wallet: { type: "string" }, tx_signature: { type: "string" } },
      required: ["token_id", "wallet", "tx_signature"],
    },
    run: async (a, ctx) => {
      const id = str(a, "token_id", { required: true, max: 64 })!;
      if (!UUID.test(id)) throw new ToolError("token_id must be a uuid");
      const body = { wallet: str(a, "wallet", { required: true, max: 64 }), tx_signature: str(a, "tx_signature", { required: true, max: 200 }) };
      return okJson(await launchConfirmRoute(post(ctx, `/api/v1/launch/${id}/confirm`, body), idParams(id)));
    },
  },
];

export { ToolError };
