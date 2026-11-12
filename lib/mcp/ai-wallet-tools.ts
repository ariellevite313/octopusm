/**
 * Outils du wallet autonome de l'IA (MCP connecté). L'humain crée le wallet, le finance et fixe les plafonds
 * dans « Applications connectées » ; l'IA agit ensuite seule, dans ces limites. Ces outils agissent avec le
 * compte de l'IA (son propre profil), pas avec celui de l'humain.
 */
import { ToolError, type McpTool, type ToolCtx } from "@/lib/mcp/tools";
import { AgentWalletError, aiBet, aiCreateMarket, aiLaunch, aiSwap, aiSwapEvm, aiTradeOm, balances, walletForConnection, type AgentWallet } from "@/lib/agent-wallet/server";
import { AgentKeyError } from "@/lib/agent-wallet/keys";

const S = (properties: Record<string, unknown>, required: string[] = []): McpTool["inputSchema"] => ({ type: "object", properties, required });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function mine(ctx: ToolCtx): Promise<AgentWallet> {
  if (!ctx.user?.clientId) throw new ToolError("Not connected");
  const w = await walletForConnection(ctx.user.wallet, ctx.user.clientId);
  if (!w) throw new ToolError("You have no wallet yet. Ask your human to create one for you in OMdotfun > Connected apps, then to fund it.");
  return w;
}
async function run<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); }
  catch (e) { if (e instanceof AgentWalletError || e instanceof AgentKeyError) throw new ToolError(e.message); throw e; }
}
const side = (v: unknown) => { if (v !== "buy" && v !== "sell") throw new ToolError("side must be buy or sell"); return v; };
const amt = (v: unknown) => { const n = Number(v); if (!Number.isFinite(n) || n <= 0) throw new ToolError("amount must be a positive number"); return n; };
const slip = (v: unknown) => (v === undefined ? undefined : Math.min(1000, Math.max(10, Math.round(Number(v)) || 100)));

export const AI_WALLET_TOOLS: McpTool[] = [
  {
    name: "ai_wallet",
    description: "Your own OMdotfun wallet (created by your human): Solana address and EVM address (same address on Arc, Base, BNB Chain, HyperEVM, Ethereum, Arbitrum, Polygon, Avalanche), balances on every chain, limits per action and per day, what you are allowed to do, and whether it is paused.",
    readOnly: true,
    inputSchema: S({}),
    run: async (_a, ctx) => {
      const w = await mine(ctx);
      return {
        solana_address: w.sol_address, arc_address: w.evm_address, balances: await balances(w),
        limits: { per_action_usd: Number(w.max_action_usd), per_day_usd: Number(w.max_day_usd) },
        allowed: { trade: w.allow_trade, launch: w.allow_launch, bet_and_markets: w.allow_bet }, paused: w.paused,
        note: "These tools act as YOUR account (your own profile), not your human's. Withdrawals can only go back to your human.",
      };
    },
  },
  {
    name: "ai_swap",
    description: "Buy or sell any Solana token with your wallet through the OMdotfun Terminal (Jupiter routing, usual OM fee). amount = SOL or USDC to spend for a buy, number of tokens for a sell.",
    readOnly: false,
    inputSchema: S({
      mint: { type: "string", description: "Token mint address" },
      side: { type: "string", enum: ["buy", "sell"] },
      amount: { type: "number" },
      pay_with: { type: "string", enum: ["SOL", "USDC"], description: "Default SOL" },
      slippage_bps: { type: "integer", minimum: 10, maximum: 1000 },
    }, ["mint", "side", "amount"]),
    run: async (a, ctx) => {
      const mint = String(a.mint ?? "");
      if (!MINT.test(mint)) throw new ToolError("mint must be a Solana token address");
      const w = await mine(ctx);
      return run(() => aiSwap(w, { mint, side: side(a.side), amount: amt(a.amount), pay_with: a.pay_with === "USDC" ? "USDC" : "SOL", slippage_bps: slip(a.slippage_bps) }));
    },
  },
  {
    name: "ai_swap_evm",
    description: "Buy or sell any token on an EVM network (base, bnb, hyperliquid, ethereum, arbitrum, polygon, avalanche) with your wallet, routed by 0x with the usual OM fee. Buy: amount = native coin to spend (ETH, BNB, HYPE, POL, AVAX). Sell: number of tokens, you receive the native coin. Fund the EVM address first (see ai_wallet).",
    readOnly: false,
    inputSchema: S({
      chain: { type: "string", enum: ["base", "bnb", "hyperliquid", "ethereum", "arbitrum", "polygon", "avalanche"] },
      token: { type: "string", description: "Token contract address (0x...)" },
      side: { type: "string", enum: ["buy", "sell"] },
      amount: { type: "number" },
      slippage_bps: { type: "integer", minimum: 10, maximum: 1000 },
    }, ["chain", "token", "side", "amount"]),
    run: async (a, ctx) => {
      const token = String(a.token ?? "");
      if (!/^0x[0-9a-fA-F]{40}$/.test(token)) throw new ToolError("token must be an EVM contract address");
      const w = await mine(ctx);
      return run(() => aiSwapEvm(w, { chain: String(a.chain ?? ""), token, side: side(a.side), amount: amt(a.amount), slippage_bps: slip(a.slippage_bps) }));
    },
  },
  {
    name: "ai_trade_om_token",
    description: "Buy or sell a token launched on OMdotfun while it is on its bonding curve. Solana tokens: amount in SOL for a buy. Arc tokens: amount in USDC for a buy. Sell: number of tokens. Graduated Solana tokens: use ai_swap with their mint.",
    readOnly: false,
    inputSchema: S({
      token_id: { type: "string", description: "Token uuid (see list_tokens / get_token)" },
      chain: { type: "string", enum: ["solana", "arc"] },
      side: { type: "string", enum: ["buy", "sell"] },
      amount: { type: "number" },
      slippage_bps: { type: "integer", minimum: 10, maximum: 1000 },
    }, ["token_id", "chain", "side", "amount"]),
    run: async (a, ctx) => {
      const id = String(a.token_id ?? "");
      if (!UUID.test(id)) throw new ToolError("token_id must be a token uuid");
      const w = await mine(ctx);
      return run(() => aiTradeOm(w, { token_id: id, chain: a.chain === "arc" ? "arc" : "solana", side: side(a.side), amount: amt(a.amount), slippage_bps: slip(a.slippage_bps) }));
    },
  },
  {
    name: "ai_launch_token",
    description: "Launch a Solana token on OMdotfun with your wallet: you are its creator and earn the creator fees. Pays the launch fee in SOL, plus an optional first buy.",
    readOnly: false,
    inputSchema: S({
      name: { type: "string", maxLength: 10 }, ticker: { type: "string", description: "2-8 letters/digits" },
      description: { type: "string", maxLength: 1000 },
      category: { type: "string", enum: ["Meme", "Utility", "AI", "Gaming", "DeFi", "NFT", "x402"] },
      logo_base64: { type: "string", description: "PNG/JPEG/WebP/GIF, max 1 MB" },
      logo_mime: { type: "string", enum: ["image/png", "image/jpeg", "image/webp", "image/gif"] },
      website: { type: "string" }, twitter: { type: "string" }, telegram: { type: "string" },
      first_buy_sol: { type: "number", minimum: 0, maximum: 100 },
    }, ["name", "ticker"]),
    run: async (a, ctx) => {
      const w = await mine(ctx);
      const p: Record<string, unknown> = {};
      for (const k of ["name", "ticker", "description", "category", "logo_base64", "logo_mime", "website", "twitter", "telegram", "first_buy_sol"]) if (a[k] !== undefined) p[k] = a[k];
      return run(() => aiLaunch(w, p, ctx.origin));
    },
  },
  {
    name: "ai_bet",
    description: "Bet USDC (Solana, minimum 2) on an option of a prediction market (pool) with your wallet. Like every bet it is validated by the OMdotfun team.",
    readOnly: false,
    inputSchema: S({ market_id: { type: "string" }, option_id: { type: "string" }, amount: { type: "number", minimum: 2 } }, ["market_id", "option_id", "amount"]),
    run: async (a, ctx) => {
      const id = String(a.market_id ?? "");
      if (!UUID.test(id)) throw new ToolError("market_id must be a market uuid");
      const w = await mine(ctx);
      return run(() => aiBet(w, { market_id: id, option_id: String(a.option_id ?? "").slice(0, 64), amount: amt(a.amount) }));
    },
  },
  {
    name: "ai_create_market",
    description: "Create a prediction market (pool, 2 to 8 options) with your wallet: pays the 0.5 USDC fee (Solana) then sends it to review like any market.",
    readOnly: false,
    inputSchema: S({
      title: { type: "string", maxLength: 200 }, description: { type: "string", maxLength: 1000 }, category: { type: "string" },
      options: { type: "array", minItems: 2, maxItems: 8, items: { type: "object", properties: { label: { type: "string", maxLength: 80 }, image_url: { type: "string" } }, required: ["label"] } },
      cover_image_url: { type: "string" }, betting_closes_at: { type: "string", description: "ISO date, at least 1 hour from now" },
    }, ["title", "options", "betting_closes_at"]),
    run: async (a, ctx) => {
      const w = await mine(ctx);
      const p: Record<string, unknown> = { bet_token: "usdc" };
      for (const k of ["title", "description", "category", "options", "cover_image_url", "betting_closes_at"]) if (a[k] !== undefined) p[k] = a[k];
      return run(() => aiCreateMarket(w, p, { origin: ctx.origin, ip: ctx.ip }));
    },
  },
];
