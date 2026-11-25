import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient, createClient } from "@/lib/supabase/server";

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

  // Journal : chaque écriture faite par un admin est enregistrée (qui, quoi, quand, depuis quelle IP)
  try {
    const h = await headers();
    const method = h.get("x-om-method") ?? "";
    if (method && method !== "GET" && method !== "HEAD") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (createAdminClient() as any).from("admin_audit_log").insert({
        admin_id: user.id,
        method,
        path: (h.get("x-om-path") ?? "").slice(0, 300),
        ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64) || null,
      });
    }
  } catch { /* le journal ne bloque jamais l'action */ }

  return null;
}
