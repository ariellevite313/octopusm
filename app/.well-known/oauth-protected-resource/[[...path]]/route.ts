import { origin, resourceMetadata } from "@/lib/oauth/core";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version", "Cache-Control": "no-store" } as const;
export const dynamic = "force-dynamic";
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
export const GET = (req: Request) => Response.json(resourceMetadata(origin(req)), { headers: CORS });
