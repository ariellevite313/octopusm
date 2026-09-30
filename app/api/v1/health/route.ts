/**
 * GET /api/v1/health
 * Liveness check.
 */
import { json, corsOk, CORS_HEADERS } from "@/lib/v1/helpers";

const VERSION = "1.0.0";

export async function OPTIONS() { return corsOk(); }

export async function GET() {
  return json({ ok: true, version: VERSION, ts: new Date().toISOString() });
}

export const revalidate = 0;
export const headers = () => CORS_HEADERS;
