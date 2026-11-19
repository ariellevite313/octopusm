/** GET /api/fiat-rates : unités de chaque monnaie pour 1 USD (open.er-api.com, gratuit), en cache 6 h. */
import { NextResponse } from "next/server";
import { FIAT_CODES } from "@/lib/fiat";

export const dynamic = "force-dynamic";
let cache: { at: number; rates: Record<string, number> } | null = null;
const TTL = 6 * 3600_000;

export async function GET() {
  if (!cache || Date.now() - cache.at > TTL) {
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000), cache: "no-store" });
      const j = (await r.json()) as { result?: string; rates?: Record<string, number> };
      if (j.result === "success" && j.rates) {
        const rates: Record<string, number> = {};
        for (const c of FIAT_CODES) { const v = Number(j.rates[c]); if (v > 0) rates[c] = v; }
        cache = { at: Date.now(), rates };
      }
    } catch { /* on garde les derniers taux connus */ }
  }
  return NextResponse.json({ rates: cache?.rates ?? {} }, { headers: { "Cache-Control": "public, max-age=1800" } });
}
