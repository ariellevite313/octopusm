/**
 * Outils MCP du Terminal (compte connecté) : sécurité d'un token, Pulse, prédictions d'un token (dont le pool automatique),
 * alertes de capitalisation (stop-loss / take-profit), wallets suivis, ordres ouverts (limite et TWAP).
 * Aucun mouvement d'argent : placer un ordre demande toujours la signature du wallet de l'utilisateur sur OMdotfun.
 */
import { ToolError, type McpTool } from "@/lib/mcp/tools";
import { createAdminClient } from "@/lib/supabase/server";
import { tokenSecurity } from "@/lib/terminal-security";
import { pulse } from "@/lib/terminal-pulse";
import { GT_NET, type TerminalChain } from "@/lib/terminal";
import { activeOrders } from "@/lib/swap/jup-trigger";
import { activeTwaps } from "@/lib/swap/jup-recurring";
import { getBook } from "@/lib/terminal-book";

const S = (properties: Record<string, unknown>, required: string[] = []): McpTool["inputSchema"] => ({ type: "object", properties, required });
const ADDR = /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})$/;
const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CHAINS = ["solana", "arc", "base", "bnb", "hyperliquid", "ethereum", "arbitrum", "polygon", "avalanche"];
const ALERT_CHAINS = new Set(["solana", "base", "bnb", "ethereum", "arbitrum", "polygon", "avalanche", "hyperliquid"]);
const CHAIN = { type: "string", enum: CHAINS, description: "Network, default solana" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

function user(ctx: { user?: { wallet: string; scopes: string[] } | null }, scope?: string): string {
  if (!ctx.user) throw new ToolError("Not connected");
  if (scope && !ctx.user.scopes.includes(scope)) throw new ToolError(`This connection does not allow it (missing permission: ${scope}). Reconnect OMdotfun and allow it.`);
  return ctx.user.wallet;
}
const addr = (v: unknown, name = "mint") => { const s = String(v ?? "").trim(); if (!ADDR.test(s)) throw new ToolError(`${name} must be a token address`); return s; };

export const TERMINAL_TOOLS: McpTool[] = [
  {
    name: "get_token_security",
    description: "Security card of a token, as in the Terminal « Important » button: can sell, buy/sell tax, mintable, freeze, ownership renounced, LP locked or burned, top 10 holders, dev holdings, rugged flag and reported risks. Source RugCheck (Solana) or GoPlus (EVM). Estimates, not investment advice.",
    readOnly: true,
    inputSchema: S({ chain: CHAIN, mint: { type: "string", description: "Token address" } }, ["mint"]),
    run: async (a) => {
      const s = await tokenSecurity(String(a.chain ?? "solana"), addr(a.mint)).catch(() => null);
      if (!s) throw new ToolError("Security data not available for this token");
      return s;
    },
  },
  {
    name: "get_pulse",
    description: "Terminal Pulse: brand new tokens of a network. Solana: new (pump.fun, LetsBonk, Bags, Meteora, OMdotfun launches), final stretch (close to graduation) and just migrated. Other networks: new pools, top volume, most liquid. Very risky tokens, not investment advice.",
    readOnly: true,
    inputSchema: S({ chain: { type: "string", enum: Object.keys(GT_NET).filter((c) => GT_NET[c as TerminalChain]), description: "Default solana" }, limit: { type: "integer", minimum: 1, maximum: 40 } }),
    run: async (a) => {
      const chain = (typeof a.chain === "string" && GT_NET[a.chain as TerminalChain] ? a.chain : "solana") as TerminalChain;
      const n = Math.min(40, Math.max(1, Number(a.limit) || 15));
      const p = await pulse(chain);
      const map = (l: typeof p.fresh) => l.slice(0, n).map((t) => ({ address: t.mint, symbol: t.symbol, name: t.name, platform: t.dexId, mcap: t.mcap, volume24h: t.volume24h, liquidity: t.liquidity, created_at: t.createdAt }));
      return chain === "solana" ? { chain, new: map(p.fresh), final_stretch: map(p.stretch), migrated: map(p.migrated) } : { chain, new: map(p.fresh), top_volume: map(p.stretch), most_liquid: map(p.migrated) };
    },
  },
  {
    name: "get_token_predictions",
    description: "Prediction pools about a token (Terminal « Predict » tab), including the automatic pool « Will $TOKEN reach X market cap before … ? » (about 10x the market cap, 7 days, a new level opens when it resolves). Use request_approval with kind bet_pool to suggest a prediction to the user.",
    readOnly: true,
    inputSchema: S({ mint: { type: "string", description: "Token address" } }, ["mint"]),
    run: async (a) => {
      const mint = addr(a.mint);
      const { data, error } = await db().from("mutuel_markets")
        .select("id, slug, title, options, status, bet_token, betting_closes_at, total_pool_usdc, total_pool_clt, bet_count, winning_option_id, auto_target, auto_level")
        .eq("token_mint", mint).in("status", ["active", "closed", "resolved"]).order("created_at", { ascending: false }).limit(10);
      if (error) return { pools: [] };
      return { pools: ((data ?? []) as Record<string, unknown>[]).map((p) => ({ ...p, automatic: p.auto_target != null, url: `https://omdot.fun/pools/${p.slug}` })) };
    },
  },
  {
    name: "list_price_alerts",
    description: "The connected user's active market cap alerts (Terminal bell). Each alert notifies once when the market cap crosses the value; the notification opens the sell screen (stop-loss / take-profit in one tap).",
    readOnly: true,
    inputSchema: S({}),
    run: async (_a, ctx) => {
      const w = user(ctx);
      const { data } = await db().from("terminal_alerts").select("id, chain, mint, symbol, kind, value, created_at").eq("wallet", w).is("triggered_at", null).order("created_at", { ascending: false }).limit(20);
      return { alerts: data ?? [] };
    },
  },
  {
    name: "set_price_alert",
    description: "Create a market cap alert for the connected user (max 20 active). kind mcap_below = stop-loss style, mcap_above = take-profit style. It only notifies: selling is always confirmed by the user with their wallet.",
    readOnly: false,
    inputSchema: S({ chain: { type: "string", enum: [...ALERT_CHAINS] }, mint: { type: "string" }, symbol: { type: "string", maxLength: 16 }, kind: { type: "string", enum: ["mcap_above", "mcap_below"] }, value: { type: "number", description: "Market cap in USD" } }, ["mint", "kind", "value"]),
    run: async (a, ctx) => {
      const w = user(ctx, "social");
      const chain = String(a.chain ?? "solana"), mint = addr(a.mint), kind = String(a.kind), value = Number(a.value);
      if (!ALERT_CHAINS.has(chain) || (kind !== "mcap_above" && kind !== "mcap_below") || !(value > 0) || value > 1e13) throw new ToolError("Invalid alert");
      const { count } = await db().from("terminal_alerts").select("id", { count: "exact", head: true }).eq("wallet", w).is("triggered_at", null);
      if ((count ?? 0) >= 20) throw new ToolError("20 active alerts maximum");
      const symbol = String(a.symbol ?? "").replace(/[^\p{L}\p{N}_.$-]/gu, "").slice(0, 16) || null;
      const { data, error } = await db().from("terminal_alerts").insert({ wallet: w, chain, mint, symbol, kind, value }).select("id").single();
      if (error) throw new ToolError("Could not save the alert");
      return { id: data.id };
    },
  },
  {
    name: "delete_price_alert",
    description: "Delete one of the connected user's market cap alerts (id from list_price_alerts).",
    readOnly: false,
    inputSchema: S({ id: { type: "string" } }, ["id"]),
    run: async (a, ctx) => {
      const w = user(ctx, "social");
      if (!/^[0-9a-f-]{36}$/i.test(String(a.id ?? ""))) throw new ToolError("Invalid id");
      await db().from("terminal_alerts").delete().eq("id", a.id).eq("wallet", w);
      return { ok: true };
    },
  },
  {
    name: "list_tracked_wallets",
    description: "Solana wallets the connected user follows in the Terminal: each buy or sell they make is notified (wallet_trade notifications).",
    readOnly: true,
    inputSchema: S({}),
    run: async (_a, ctx) => {
      const w = user(ctx);
      const { data } = await db().from("tracked_wallets").select("id, address, label, created_at").eq("owner", w).order("created_at", { ascending: false });
      return { wallets: data ?? [] };
    },
  },
  {
    name: "track_wallet",
    description: "Follow a Solana wallet in the Terminal for the connected user (max 10): its token buys and sells will be notified.",
    readOnly: false,
    inputSchema: S({ address: { type: "string", description: "Solana wallet" }, label: { type: "string", maxLength: 24 } }, ["address"]),
    run: async (a, ctx) => {
      const w = user(ctx, "social");
      const address = String(a.address ?? "").trim();
      if (!SOL.test(address)) throw new ToolError("Invalid Solana address");
      if (address === w) throw new ToolError("That is the user's own wallet");
      const { count } = await db().from("tracked_wallets").select("id", { count: "exact", head: true }).eq("owner", w);
      if ((count ?? 0) >= 10) throw new ToolError("10 wallets maximum");
      const label = String(a.label ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24) || null;
      const { error } = await db().from("tracked_wallets").insert({ owner: w, address, label });
      if (error) throw new ToolError(error.code === "23505" ? "Already tracked" : "Could not save");
      return { ok: true };
    },
  },
  {
    name: "untrack_wallet",
    description: "Stop following a wallet in the Terminal (id from list_tracked_wallets).",
    readOnly: false,
    inputSchema: S({ id: { type: "string" } }, ["id"]),
    run: async (a, ctx) => {
      const w = user(ctx, "social");
      if (!/^[0-9a-f-]{36}$/i.test(String(a.id ?? ""))) throw new ToolError("Invalid id");
      await db().from("tracked_wallets").delete().eq("id", a.id).eq("owner", w);
      return { ok: true };
    },
  },
  {
    name: "get_order_book",
    description: "Order book of a Solana token as shown in the OMdotfun Terminal (Limit mode): for each market cap level above and below the current one, the SOL needed to move the pool there (pool depth), plus limit orders placed on OMdotfun (marked om: true; amounts and levels only, never wallets). It is an estimate from pool depth, not a real exchange order book. Not investment advice.",
    readOnly: true,
    inputSchema: S({ mint: { type: "string", description: "Solana token mint address" } }, ["mint"]),
    run: async (a) => {
      const mint = String(a.mint ?? "").trim();
      if (!SOL.test(mint)) throw new ToolError("mint must be a Solana token address");
      const b = await getBook(db(), mint).catch(() => null);
      if (!b) throw new ToolError("Price not available for this token");
      const r = (x: { mcap: number; sol: number; om: boolean }) => ({ market_cap_usd: Math.round(x.mcap), sol: Number(x.sol.toPrecision(3)), om: x.om });
      return { market_cap_usd: Math.round(b.mcap), price_usd: b.price, asks: b.asks.map(r), bids: b.bids.map(r) };
    },
  },
  {
    name: "list_my_orders",
    description: "The connected user's open orders on Solana, held by Jupiter: limit orders and TWAP orders (a buy or sell split over time). To place or cancel an order the user must do it on OMdotfun (Terminal, « Limit and TWAP orders »): it needs their wallet signature.",
    readOnly: true,
    inputSchema: S({}),
    run: async (_a, ctx) => {
      const w = user(ctx);
      if (w.startsWith("0x")) return { limit: [], twap: [], note: "Limit and TWAP orders are on Solana only" };
      const [limit, twap] = await Promise.all([activeOrders(w).catch(() => []), activeTwaps(w).catch(() => [])]);
      return { limit, twap };
    },
  },
];
