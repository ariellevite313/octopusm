/**
 * Serveur MCP (Model Context Protocol) minimal, sans état, en « Streamable HTTP » :
 * l'agent envoie du JSON-RPC 2.0 en POST et reçoit la réponse en JSON.
 * Méthodes : initialize, ping, tools/list, tools/call (+ notifications ignorées).
 */
import { TOOLS, ToolError, type ToolCtx } from "@/lib/mcp/tools";

const SERVER_INFO = { name: "omdotfun", title: "OMdotfun", version: "1.0.0" };
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

type RpcReq = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type RpcRes = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const rpcError = (id: RpcReq["id"], code: number, message: string): RpcRes => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function textResult(data: unknown, isError = false) {
  let text: string;
  try { text = typeof data === "string" ? data : JSON.stringify(data, null, 2); } catch { text = String(data); }
  // Garde-fou : réponses volumineuses tronquées
  if (text.length > 60_000) text = text.slice(0, 60_000) + "\n…(truncated)";
  return { content: [{ type: "text", text }], isError };
}

async function handleOne(msg: RpcReq, ctx: ToolCtx): Promise<RpcRes | null> {
  const isNotification = msg.id === undefined;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isNotification ? null : rpcError(msg.id, -32600, "Invalid Request");
  }

  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: {
          protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "OMdotfun: token launchpad (Solana + Arc) and prediction markets. Read tools are free and public. " +
            "To launch a token: launch_token_prepare → sign tx_a and tx_b with your own wallet key → launch_token_submit (a, then b) → launch_token_confirm. The server never holds keys.",
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id: msg.id ?? null, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: {
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: { readOnlyHint: t.readOnly, openWorldHint: false },
          })),
        },
      };
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
      const args = (msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {}) as Record<string, unknown>;
      try {
        const out = await tool.run(args, ctx);
        return { jsonrpc: "2.0", id: msg.id ?? null, result: textResult(out) };
      } catch (e) {
        // Erreur d'outil : renvoyée au modèle (isError) pour qu'il puisse corriger son appel
        const message = e instanceof ToolError ? e.message : "Tool failed";
        if (!(e instanceof ToolError)) console.error(`[mcp] tool ${name} failed:`, e);
        return { jsonrpc: "2.0", id: msg.id ?? null, result: textResult({ error: message }, true) };
      }
    }
    default:
      // notifications/initialized, notifications/cancelled… : rien à répondre
      return isNotification ? null : rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/** Traite un corps JSON-RPC (message unique ou lot). null = rien à renvoyer (notifications seules). */
export async function handleRpc(body: unknown, ctx: ToolCtx): Promise<RpcRes | RpcRes[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > 20) return rpcError(null, -32600, "Invalid batch");
    const out = (await Promise.all(body.map((m) => handleOne(m as RpcReq, ctx)))).filter((r): r is RpcRes => r !== null);
    return out.length ? out : null;
  }
  if (!body || typeof body !== "object") return rpcError(null, -32600, "Invalid Request");
  return handleOne(body as RpcReq, ctx);
}

export const MCP_INFO = {
  ...SERVER_INFO,
  transport: "streamable-http",
  endpoint: "https://omdot.fun/mcp",
  protocolVersions: SUPPORTED,
  tools: TOOLS.map((t) => ({ name: t.name, readOnly: t.readOnly })),
};
