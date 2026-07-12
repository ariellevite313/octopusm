import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared admin guard for API routes.
 * Returns null if the caller is an authenticated admin.
 * Returns a NextResponse (401 or 403) if not.
 *
 * Usage:
 *   const denied = await requireAdminApi();
 *   if (denied) return denied;
 */
export async function requireAdminApi(): Promise<NextResponse | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: isAdmin } = await (supabase as any).rpc("is_admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
