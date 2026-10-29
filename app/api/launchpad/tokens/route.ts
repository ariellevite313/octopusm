/**
 * GET /api/launchpad/tokens
 *
 * Paginated, sortable token list for the Launchpad page.
 *
 * Query params:
 *   sort   = new | old | verified | market_cap_desc | market_cap_asc | volume  (default: new)
 *   tab    = all | graduated | scheduled                                        (default: all)
 *   page   = 0-based page number                                                (default: 0)
 *   limit  = items per page (max 50)                                            (default: 20)
 *
 * Verified tokens always appear first within each sort (except sort=verified
 * which filters to verified-only tokens).
 */
import { NextResponse } from "next/server";
import { getLaunchpadTokens, type SortOption } from "@/services/launchpad-service";
import { refreshArcStats } from "@/lib/arc-stats";
import { createAdminClient } from "@/lib/supabase/server";

const VALID_SORTS: SortOption[] = ["new", "old", "verified", "market_cap_desc", "market_cap_asc", "volume"];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const rawSort  = searchParams.get("sort")   ?? "new";
    const tab      = searchParams.get("tab")    ?? "all";
    const search   = searchParams.get("search") ?? "";
    const rawChain = searchParams.get("chain")  ?? "";
    const page     = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
    const limit    = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset   = page * limit;

    const chain: "solana" | "arc" | undefined =
      rawChain === "solana" || rawChain === "arc" ? rawChain : undefined;

    const sort: SortOption = VALID_SORTS.includes(rawSort as SortOption)
      ? (rawSort as SortOption)
      : "new";

    // Map tab → status / excludeStatuses params
    let status: "pending" | "active" | "cancelled" | "graduating" | "graduated" | "coming_soon" | undefined;
    let excludeStatuses: ("pending" | "active" | "graduating" | "graduated" | "cancelled")[] = ["pending", "cancelled"];

    if (tab === "graduated") {
      status = "graduated";
      excludeStatuses = [];
    } else if (tab === "scheduled") {
      status = "coming_soon";
      excludeStatuses = [];
    }

    const { tokens, total } = await getLaunchpadTokens({
      sort,
      status,
      excludeStatuses,
      search: search || undefined,
      chain,
      limit,
      offset,
      withCount: true,
    });

    // Tokens Arc sans valeur (nouveaux, ou cron en retard) : on calcule tout de suite pour ne pas afficher « $— »
    const blank = tokens.filter((t) => t.chain === "arc" && t.market_cap_usd == null).map((t) => t.id);
    if (blank.length > 0) {
      try {
        await Promise.race([refreshArcStats(new URL(req.url).origin, blank.slice(0, 10)), new Promise((r) => setTimeout(r, 6000))]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: fresh } = await (createAdminClient() as any).from("launchpad_tokens").select("id, price_usd, market_cap_usd, volume_24h_usd").in("id", blank);
        const byId = new Map<string, { price_usd: number | null; market_cap_usd: number | null; volume_24h_usd: number | null }>((fresh ?? []).map((f: { id: string }) => [f.id, f as never]));
        for (const t of tokens) { const f = byId.get(t.id); if (f && f.market_cap_usd != null) { t.price_usd = f.price_usd; t.market_cap_usd = f.market_cap_usd; t.volume_24h_usd = f.volume_24h_usd; } }
      } catch (e) { console.error("[launchpad/tokens] arc stats:", e); }
    }

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({ tokens, total, page, totalPages, limit });
  } catch (err) {
    console.error("[launchpad/tokens] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
