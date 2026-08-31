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

const VALID_SORTS: SortOption[] = ["new", "old", "verified", "market_cap_desc", "market_cap_asc", "volume"];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const rawSort  = searchParams.get("sort")  ?? "new";
    const tab      = searchParams.get("tab")   ?? "all";
    const page     = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
    const limit    = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset   = page * limit;

    const sort: SortOption = VALID_SORTS.includes(rawSort as SortOption)
      ? (rawSort as SortOption)
      : "new";

    // Map tab → status / excludeStatuses params
    let status: Parameters<typeof getLaunchpadTokens>[0]["status"] | undefined;
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
      limit,
      offset,
      withCount: true,
    });

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({ tokens, total, page, totalPages, limit });
  } catch (err) {
    console.error("[launchpad/tokens] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
