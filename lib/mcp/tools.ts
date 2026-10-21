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
import { POST as launchRoute } from "@/app/api/v1/launch/route";
import { POST as launchSubmitRoute } from "@/app/api/v1/launch/[id]/submit/route";
import { POST as launchConfirmRoute } from "@/app/api/v1/launch/[id]/confirm/route";
import { getLaunchpadToken } from "@/services/launchpad-service";
import { getPublicProfile } from "@/services/profile-service";

export type ToolCtx = { origin: string; ip: string };

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
