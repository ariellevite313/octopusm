import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function PATCH(req: Request) {
  // Verify session
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.app_metadata?.wallet_address ?? null;
  if (!wallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only allow safe fields
  const allowed = ["username", "display_name", "twitter_handle", "avatar_src", "bio"] as const;
  const updates: Record<string, string | null> = {};
  for (const key of allowed) {
    if (key in body) {
      const val = body[key];
      updates[key] = typeof val === "string" && val.trim() ? val.trim() : null;
    }
  }

  // Bio : 160 caractères, contrôlée comme un post
  if ("bio" in updates && updates.bio) {
    updates.bio = updates.bio.replace(/\s+\n/g, "\n").slice(0, 160);
    const { moderateText } = await import("@/lib/moderation");
    if ((await moderateText(updates.bio)) === "blocked") return NextResponse.json({ error: "This bio goes against our rules" }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  // Use admin client to bypass RLS
  const admin = createAdminClient() as any;
  const { error } = await admin.from("wallets").update(updates).eq("address", wallet);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
